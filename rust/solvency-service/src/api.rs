//! Request and response shapes, and the pure functions behind each route.
//!
//! Handlers in `main.rs` only decode, call into here, and encode. Everything
//! that decides something lives in this module and is tested without a
//! socket.
//!
//! Amounts cross the boundary as 18dp decimal strings and are parsed with the
//! same `parse_amount_18dp` the CLI uses. Documents leave as the exact text
//! that was signed: the web tier stores and serves those bytes and never
//! re-serialises them.

use anyhow::{Context, Result, bail};
use canton_reserve_attest::{HoldingFields, build::build_custody_report, parse_holdings, totals};
use canton_solvency_merkle::{format_amount_18dp, leaf_salt, parse_amount_18dp};
use canton_solvency_report::anchor::{Anchor, anchor_digest_hex, anchor_report};
use canton_solvency_report::digest::report_digest_hex;
use canton_solvency_report::document::Disclosures;
use canton_solvency_report::manifest::Manifest;
use canton_solvency_report::pack::build_pack;
use canton_solvency_report::produce::{LeafInput, ReportMetadata, publish};
use canton_solvency_report::sign::ReportSigner;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const LIABILITIES_PROFILE: &str = "solvency.liabilities";
pub const CUSTODY_PROFILE: &str = "coverage.custody";

/// One delivered file: the name it is packed under and its exact bytes.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct FileOut {
    pub name: String,
    pub content: String,
}

fn pretty<T: Serialize>(value: &T) -> Result<String> {
    Ok(format!("{}\n", serde_json::to_string_pretty(value)?))
}

fn amounts(map: &BTreeMap<String, String>, what: &str) -> Result<BTreeMap<String, u128>> {
    map.iter()
        .map(|(k, v)| {
            parse_amount_18dp(v)
                .map(|a| (k.clone(), a))
                .with_context(|| format!("{what}: {k} = {v:?}"))
        })
        .collect()
}

fn display_amounts(map: &BTreeMap<String, u128>) -> BTreeMap<String, String> {
    map.iter()
        .map(|(k, v)| (k.clone(), format_amount_18dp(*v)))
        .collect()
}

/// Proof files are named by a digest of the leaf identity, never by the
/// identity itself: a pack index is shared with auditors, and a list of
/// customer ids is not part of what a pack should disclose.
pub fn proof_file_name(user_id: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(user_id.as_bytes());
    format!("proof-{}.json", hex::encode(&digest[..12]))
}

// ---------------------------------------------------------------------------
// POST /keys
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct KeyRequest {
    pub org_id: String,
}

#[derive(Serialize)]
pub struct KeyResponse {
    pub public_key: String,
}

// ---------------------------------------------------------------------------
// POST /publish
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug, Clone)]
pub struct LeafIn {
    pub user_id: String,
    /// Asset → 18dp decimal. A leading `-` is a negative balance: it is
    /// clamped to zero and disclosed as bad debt (SPEC §1).
    pub balances: BTreeMap<String, String>,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct DisclosuresIn {
    #[serde(default)]
    pub bad_debt: BTreeMap<String, String>,
    #[serde(default)]
    pub excluded_house_accounts: u64,
    #[serde(default)]
    pub excluded_house_totals: BTreeMap<String, String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct PublishRequest {
    pub org_id: String,
    pub publisher: String,
    #[serde(default = "default_profile")]
    pub profile: String,
    pub snapshot_time: String,
    pub ledger_offset: String,
    pub leaves: Vec<LeafIn>,
    #[serde(default)]
    pub mark_prices: BTreeMap<String, String>,
    #[serde(default)]
    pub disclosures: DisclosuresIn,
    /// From the disclosure designer; present means format v2.
    #[serde(default)]
    pub manifest: Option<Manifest>,
    /// The organisation's most recent anchor, so the new one links to it.
    #[serde(default)]
    pub previous_anchor: Option<Anchor>,
}

fn default_profile() -> String {
    LIABILITIES_PROFILE.to_string()
}

#[derive(Serialize, Debug)]
pub struct ProofOut {
    pub user_id: String,
    pub file_name: String,
}

#[derive(Serialize, Debug)]
pub struct PublishResponse {
    pub public_key: String,
    pub format_version: String,
    pub report_digest: String,
    pub anchor_digest: String,
    pub root_hash: String,
    pub leaf_count: u64,
    pub root_sums: BTreeMap<String, String>,
    /// How many balances were negative and clamped into bad debt.
    pub clamped: usize,
    pub proofs: Vec<ProofOut>,
    /// `report.json`, `anchor.json`, `pack.json`, and one file per proof.
    pub files: Vec<FileOut>,
}

pub fn do_publish(req: &PublishRequest, signer: &ReportSigner) -> Result<PublishResponse> {
    if req.leaves.is_empty() {
        bail!("cannot publish a report with no leaves");
    }
    if req.profile != LIABILITIES_PROFILE {
        bail!(
            "this route publishes {LIABILITIES_PROFILE}; got {:?}",
            req.profile
        );
    }

    // Negative equity never enters the tree: clamp to zero, disclose as bad
    // debt, and say how many times it happened.
    let mut bad_debt = amounts(&req.disclosures.bad_debt, "disclosures.bad_debt")?;
    let mut clamped = 0usize;
    let mut users: BTreeMap<String, BTreeMap<String, u128>> = BTreeMap::new();
    for (i, leaf) in req.leaves.iter().enumerate() {
        let user_id = leaf.user_id.trim();
        if user_id.is_empty() {
            bail!("leaf {i}: empty user_id");
        }
        if users.contains_key(user_id) {
            bail!("leaf {i}: duplicate user_id {user_id:?}");
        }
        let mut balances = BTreeMap::new();
        for (asset, raw) in &leaf.balances {
            let asset = asset.trim();
            if asset.is_empty() {
                bail!("leaf {user_id:?}: empty asset name");
            }
            let raw = raw.trim();
            let amount = if let Some(magnitude) = raw.strip_prefix('-') {
                let owed = parse_amount_18dp(magnitude)
                    .with_context(|| format!("leaf {user_id:?}: {asset} = {raw:?}"))?;
                let slot = bad_debt.entry(asset.to_string()).or_insert(0);
                *slot = slot
                    .checked_add(owed)
                    .context("bad debt total overflows u128")?;
                clamped += 1;
                0
            } else {
                parse_amount_18dp(raw)
                    .with_context(|| format!("leaf {user_id:?}: {asset} = {raw:?}"))?
            };
            balances.insert(asset.to_string(), amount);
        }
        users.insert(user_id.to_string(), balances);
    }

    // A fresh master salt per snapshot (SPEC §3): the same customer's leaf is
    // unlinkable across reports. It is never stored; each proof carries the
    // per-leaf salt it needs.
    let mut master_salt = [0u8; 32];
    rand::fill(&mut master_salt);

    // Leaves in ascending user_id, as SPEC §4 requires; BTreeMap gives it.
    let leaves: Vec<LeafInput> = users
        .into_iter()
        .map(|(user_id, balances)| LeafInput {
            salt: leaf_salt(&master_salt, &user_id),
            user_id,
            balances,
        })
        .collect();

    let metadata = ReportMetadata {
        profile: req.profile.clone(),
        publisher: req.publisher.clone(),
        snapshot_time: req.snapshot_time.clone(),
        ledger_offset: req.ledger_offset.clone(),
        mark_prices: amounts(&req.mark_prices, "mark_prices")?,
        disclosures: Disclosures {
            bad_debt,
            excluded_house_accounts: req.disclosures.excluded_house_accounts,
            excluded_house_totals: amounts(
                &req.disclosures.excluded_house_totals,
                "disclosures.excluded_house_totals",
            )?,
        },
        manifest: req.manifest.clone(),
    };

    let published = publish(&leaves, &metadata, signer)?;
    let signed = &published.signed_report;
    let report_digest = report_digest_hex(&signed.report);

    let anchor = anchor_report(signed, req.previous_anchor.as_ref());
    let anchor_digest = anchor_digest_hex(&anchor);

    let mut files = vec![
        FileOut {
            name: "report.json".into(),
            content: pretty(signed)?,
        },
        FileOut {
            name: "anchor.json".into(),
            content: pretty(&anchor)?,
        },
    ];
    let mut proofs = Vec::with_capacity(published.proofs.len());
    for proof in &published.proofs {
        let file_name = proof_file_name(&proof.leaf.user_id);
        proofs.push(ProofOut {
            user_id: proof.leaf.user_id.clone(),
            file_name: file_name.clone(),
        });
        files.push(FileOut {
            name: file_name,
            content: pretty(proof)?,
        });
    }

    // The pack commits the *set* of files (SPEC §15). It is built over the
    // exact bytes above, so those bytes are what the web tier must serve.
    let members: Vec<(String, Vec<u8>)> = files
        .iter()
        .map(|f| (f.name.clone(), f.content.as_bytes().to_vec()))
        .collect();
    let pack = build_pack(
        &signed.report.publisher,
        &signed.report.snapshot_time,
        &report_digest,
        &members,
        signer,
    )
    .map_err(|e| anyhow::anyhow!("building the evidence pack: {e:?}"))?;
    files.push(FileOut {
        name: "pack.json".into(),
        content: pretty(&pack)?,
    });

    Ok(PublishResponse {
        public_key: signer.public_key_hex(),
        format_version: signed.report.format_version.clone(),
        report_digest,
        anchor_digest,
        root_hash: signed.report.root_hash.clone(),
        leaf_count: signed.report.leaf_count,
        root_sums: display_amounts(&signed.report.root_sums),
        clamped,
        proofs,
        files,
    })
}

// ---------------------------------------------------------------------------
// POST /custody
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug, Clone)]
pub struct CustodyRequest {
    pub org_id: String,
    pub publisher: String,
    pub snapshot_time: String,
    pub ledger_offset: String,
    /// A saved JSON Ledger API v2 active-contracts response: a bare array of
    /// `contractEntry.JsActiveContract` entries.
    pub response_json: String,
    /// Which `createArgument` fields carry the asset and the amount.
    pub asset_field: String,
    pub amount_field: String,
}

#[derive(Serialize, Debug)]
pub struct PositionOut {
    pub contract_id: String,
    pub asset: String,
    pub amount: String,
}

#[derive(Serialize, Debug)]
pub struct CustodyResponse {
    pub public_key: String,
    pub report_digest: String,
    pub root_hash: String,
    pub leaf_count: u64,
    pub root_sums: BTreeMap<String, String>,
    pub positions: Vec<PositionOut>,
    /// `custody-report.json`.
    pub files: Vec<FileOut>,
}

pub fn do_custody(req: &CustodyRequest, signer: &ReportSigner) -> Result<CustodyResponse> {
    let fields = HoldingFields {
        asset: req.asset_field.clone(),
        amount: req.amount_field.clone(),
    };
    let positions = parse_holdings(&req.response_json, &fields)?;
    if positions.is_empty() {
        bail!("the snapshot holds no positions");
    }
    let _ = totals(&positions)?; // overflow check, same as the CLI example

    let meta = ReportMetadata {
        profile: CUSTODY_PROFILE.to_string(),
        publisher: req.publisher.clone(),
        snapshot_time: req.snapshot_time.clone(),
        ledger_offset: req.ledger_offset.clone(),
        mark_prices: BTreeMap::new(),
        disclosures: Default::default(),
        manifest: None,
    };
    let mut master_salt = [0u8; 32];
    rand::fill(&mut master_salt);
    let report = build_custody_report(&positions, &meta, &req.ledger_offset, &master_salt, signer)?;

    Ok(CustodyResponse {
        public_key: signer.public_key_hex(),
        report_digest: report_digest_hex(&report.report),
        root_hash: report.report.root_hash.clone(),
        leaf_count: report.report.leaf_count,
        root_sums: display_amounts(&report.report.root_sums),
        positions: positions
            .iter()
            .map(|p| PositionOut {
                contract_id: p.contract_id.clone(),
                asset: p.asset.clone(),
                amount: format_amount_18dp(p.amount),
            })
            .collect(),
        files: vec![FileOut {
            name: "custody-report.json".into(),
            content: pretty(&report)?,
        }],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use canton_solvency_report::document::{ProofDocument, SignedReport};
    use canton_solvency_report::pack::{SignedPack, verify_pack};
    use canton_solvency_report::verify::verify as verify_report;

    fn signer() -> ReportSigner {
        ReportSigner::from_seed(&[7u8; 32])
    }

    fn request() -> PublishRequest {
        serde_json::from_value(serde_json::json!({
            "org_id": "org-1",
            "publisher": "venue::test",
            "snapshot_time": "2026-09-09T10:00:00Z",
            "ledger_offset": "000000000000003042",
            "leaves": [
                {"user_id": "alice", "balances": {"USDA": "100.5", "CBTC": "0.25"}},
                {"user_id": "bob", "balances": {"USDA": "7"}},
                {"user_id": "carol", "balances": {"USDA": "-3.5", "CBTC": "1"}}
            ]
        }))
        .unwrap()
    }

    fn file<'a>(resp: &'a PublishResponse, name: &str) -> &'a str {
        &resp.files.iter().find(|f| f.name == name).unwrap().content
    }

    #[test]
    fn publishes_a_report_every_proof_of_which_verifies_with_the_library() {
        let resp = do_publish(&request(), &signer()).unwrap();
        assert_eq!(resp.leaf_count, 3);
        assert_eq!(resp.clamped, 1);
        assert_eq!(resp.root_sums["USDA"], "107.500000000000000000");
        assert_eq!(resp.root_sums["CBTC"], "1.250000000000000000");

        let report: SignedReport = serde_json::from_str(file(&resp, "report.json")).unwrap();
        assert_eq!(
            report.report.disclosures.bad_debt["USDA"],
            3_500_000_000_000_000_000u128
        );
        for p in &resp.proofs {
            let proof: ProofDocument = serde_json::from_str(file(&resp, &p.file_name)).unwrap();
            assert!(
                verify_report(&report, &proof, &resp.public_key).is_ok(),
                "{} did not verify",
                p.user_id
            );
        }
    }

    #[test]
    fn the_pack_commits_exactly_the_files_returned() {
        let resp = do_publish(&request(), &signer()).unwrap();
        let pack: SignedPack = serde_json::from_str(file(&resp, "pack.json")).unwrap();
        let delivered: BTreeMap<String, Vec<u8>> = resp
            .files
            .iter()
            .filter(|f| f.name != "pack.json")
            .map(|f| (f.name.clone(), f.content.as_bytes().to_vec()))
            .collect();
        assert_eq!(verify_pack(&pack, &resp.public_key, &delivered), Ok(()));
        assert_eq!(pack.pack.entries.len(), 2 + 3);
    }

    #[test]
    fn a_second_publication_links_to_the_first_anchor() {
        let first = do_publish(&request(), &signer()).unwrap();
        let prev: Anchor = serde_json::from_str(file(&first, "anchor.json")).unwrap();
        let mut second_req = request();
        second_req.snapshot_time = "2026-09-10T10:00:00Z".into();
        second_req.ledger_offset = "000000000000004000".into();
        second_req.previous_anchor = Some(prev.clone());
        let second = do_publish(&second_req, &signer()).unwrap();
        let anchor: Anchor = serde_json::from_str(file(&second, "anchor.json")).unwrap();
        assert_eq!(
            anchor.prev_anchor.as_deref(),
            Some(first.anchor_digest.as_str())
        );
        assert!(canton_solvency_report::anchor::verify_chain(&[prev, anchor]).is_ok());
    }

    #[test]
    fn proof_file_names_do_not_carry_the_identity_and_are_pack_safe() {
        let name = proof_file_name("alice/../etc");
        assert!(!name.contains("alice"));
        assert!(!name.contains('/'));
        assert_ne!(proof_file_name("a"), proof_file_name("b"));
    }

    #[test]
    fn refuses_duplicates_empty_ids_and_bad_amounts() {
        let mut r = request();
        r.leaves.push(LeafIn {
            user_id: "alice".into(),
            balances: BTreeMap::new(),
        });
        assert!(
            do_publish(&r, &signer())
                .unwrap_err()
                .to_string()
                .contains("duplicate")
        );

        let mut r = request();
        r.leaves[0].user_id = "  ".into();
        assert!(do_publish(&r, &signer()).is_err());

        let mut r = request();
        r.leaves[0].balances.insert("USDA".into(), "1e5".into());
        assert!(do_publish(&r, &signer()).is_err());

        let mut r = request();
        r.leaves.clear();
        assert!(do_publish(&r, &signer()).is_err());
    }

    #[test]
    fn a_manifest_publishes_format_v2() {
        let mut r = request();
        r.manifest = Some(
            serde_json::from_value(serde_json::json!({
                "audience": "public",
                "fields": {"root_sums": "published", "customer_balances": "committed",
                           "customer_identities": "withheld"}
            }))
            .unwrap(),
        );
        let resp = do_publish(&r, &signer()).unwrap();
        assert_eq!(resp.format_version, "canton-solvency-report-v2");
    }

    #[test]
    fn builds_a_custody_report_from_a_saved_response() {
        let req = CustodyRequest {
            org_id: "org-1".into(),
            publisher: "venue::custody".into(),
            snapshot_time: "2026-09-09T10:00:00Z".into(),
            ledger_offset: "000000000000003042".into(),
            response_json: r#"[
              {"contractEntry":{"JsActiveContract":{"createdEvent":{"contractId":"c1","createArgument":{"instrument":"USDA","amount":"2000"}}}}},
              {"contractEntry":{"JsActiveContract":{"createdEvent":{"contractId":"c2","createArgument":{"instrument":"CBTC","amount":"2"}}}}}
            ]"#
            .into(),
            asset_field: "instrument".into(),
            amount_field: "amount".into(),
        };
        let resp = do_custody(&req, &signer()).unwrap();
        assert_eq!(resp.leaf_count, 2);
        assert_eq!(resp.root_sums["held/USDA"], "2000.000000000000000000");
        let report: SignedReport = serde_json::from_str(&resp.files[0].content).unwrap();
        assert_eq!(report.report.profile, CUSTODY_PROFILE);
        assert_eq!(report_digest_hex(&report.report), resp.report_digest);
    }
}
