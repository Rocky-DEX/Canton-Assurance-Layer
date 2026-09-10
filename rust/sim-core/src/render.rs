//! Plain-text rendering of a [`SimulationReport`] for terminals and logs.

use crate::model::*;
use std::fmt::Write;

pub fn report_to_text(r: &SimulationReport) -> String {
    let mut s = String::new();
    let headline = match r.outcome {
        Outcome::WouldSucceed => "WOULD SUCCEED".to_string(),
        Outcome::WouldFail => format!(
            "WOULD FAIL at {}",
            r.diagnosis
                .as_ref()
                .map(|d| d.phase.label())
                .unwrap_or("unknown phase")
        ),
        Outcome::Inconclusive => "INCONCLUSIVE".to_string(),
    };
    let _ = writeln!(s, "canton-sim — {headline}");
    let _ = writeln!(
        s,
        "participant: {}{}   commandId: {}   {} ms",
        r.ledger.base_url,
        r.ledger
            .participant_version
            .as_ref()
            .map(|v| format!(" (v{v})"))
            .unwrap_or_default(),
        r.command_id,
        r.elapsed_ms
    );
    let _ = writeln!(
        s,
        "actAs: {}{}",
        r.request.act_as.join(", "),
        if r.request.read_as.is_empty() {
            String::new()
        } else {
            format!("   readAs: {}", r.request.read_as.join(", "))
        }
    );

    if let Some(fx) = &r.effects {
        let _ = writeln!(s);
        let _ = writeln!(
            s,
            "Effects: {} create, {} exercise ({} consuming), {} fetch, {} rollback   on {}",
            fx.counts.creates,
            fx.counts.exercises,
            fx.counts.archives,
            fx.counts.fetches,
            fx.counts.rollbacks,
            if fx.synchronizer_id.is_empty() {
                "(unrouted)"
            } else {
                &fx.synchronizer_id
            }
        );
        for n in &fx.nodes {
            let indent = "  ".repeat(n.depth + 1);
            let line = match n.kind {
                NodeKind::Create => format!(
                    "Create {} → {}   signatories: {}",
                    short_tpl(n.template_id.as_deref()),
                    short_cid(n.contract_id.as_deref()),
                    n.signatories.join(", ")
                ),
                NodeKind::Exercise => format!(
                    "Exercise {}.{} on {}   by {}{}",
                    short_tpl(n.template_id.as_deref()),
                    n.choice.as_deref().unwrap_or("?"),
                    short_cid(n.contract_id.as_deref()),
                    n.acting_parties.join(", "),
                    if n.consuming == Some(true) {
                        "   [consuming]"
                    } else {
                        ""
                    }
                ),
                NodeKind::Fetch => format!(
                    "Fetch {} {}",
                    short_tpl(n.template_id.as_deref()),
                    short_cid(n.contract_id.as_deref())
                ),
                NodeKind::Rollback => "Rollback".to_string(),
            };
            let _ = writeln!(s, "{indent}{line}");
            if let Some(a) = &n.argument {
                let _ = writeln!(s, "{indent}  arg: {}", compact(a));
            }
            if let Some(res) = &n.result {
                let _ = writeln!(s, "{indent}  result: {}", compact(res));
            }
        }
        let _ = writeln!(s, "Informees: {}", fx.informees.join(", "));
        if !fx.input_contracts.is_empty() {
            let _ = writeln!(
                s,
                "Input contracts: {} ({} consumed)",
                fx.input_contracts.len(),
                fx.input_contracts.iter().filter(|c| c.consumed).count()
            );
            for c in &fx.input_contracts {
                let _ = writeln!(
                    s,
                    "  {} {}{}",
                    short_cid(Some(&c.contract_id)),
                    short_tpl(c.template_id.as_deref()),
                    if c.consumed {
                        "   [will be archived]"
                    } else {
                        ""
                    }
                );
            }
        }
        let _ = writeln!(
            s,
            "Prepared transaction: {} bytes, hash {}…, {}",
            fx.prepared_size_bytes,
            fx.prepared_transaction_hash_hex
                .chars()
                .take(16)
                .collect::<String>(),
            fx.hashing_scheme_version
        );
    }

    if let Some(t) = &r.traffic {
        let _ = writeln!(s);
        let _ = writeln!(
            s,
            "Traffic: {} bytes (request {} + response {}) ≈ {} USD ≈ {} CC   [pricing: {}]",
            group(t.cost.total),
            group(t.cost.confirmation_request),
            group(t.cost.confirmation_response),
            t.usd.normalize(),
            t.cc.normalize(),
            t.pricing.source
        );
    }
    if let Some(f) = &r.amulet_fee {
        let _ = writeln!(
            s,
            "Amulet fees: transfer {} + create {} + lock {} = {} USD ≈ {} CC over {} outputs   [schedule: {}]",
            f.transfer_fee_usd.normalize(),
            f.create_fee_usd.normalize(),
            f.lock_holder_fee_usd.normalize(),
            f.total_usd.normalize(),
            f.total_cc.normalize(),
            f.outputs,
            f.schedule_source
        );
    }

    if let Some(d) = &r.diagnosis {
        let _ = writeln!(s);
        let _ = writeln!(s, "{} — {}", d.code, d.title);
        let _ = writeln!(s, "  {}", d.summary);
        let x = &d.extracted;
        let mut facts = Vec::new();
        if let Some(t) = &x.template_id {
            facts.push(format!("template {t}"));
        }
        if let Some(c) = &x.choice {
            facts.push(format!("choice {c}"));
        }
        if !x.contract_ids.is_empty() {
            facts.push(format!("contracts {}", x.contract_ids.join(", ")));
        }
        if !x.missing_authorizers.is_empty() {
            facts.push(format!(
                "missing authorizers {}",
                x.missing_authorizers.join(", ")
            ));
        }
        if !facts.is_empty() {
            let _ = writeln!(s, "  {}", facts.join(" · "));
        }
        for st in &r.contract_states {
            let _ = writeln!(s, "  contract state: {}", state_line(st));
        }
        if let Some(e) = &d.explanation {
            let _ = writeln!(s, "  Canton: {e}");
        }
        if let Some(res) = &d.resolution {
            let _ = writeln!(s, "  Canton resolution: {res}");
        }
        if !d.hints.is_empty() {
            let _ = writeln!(s, "  Next steps:");
            for h in &d.hints {
                let _ = writeln!(s, "   - {h}");
            }
        }
        let _ = writeln!(
            s,
            "  retryable: {}   category: {}   http: {}   correlationId: {}",
            if d.retryable { "yes" } else { "no" },
            d.category.as_deref().unwrap_or("?"),
            d.error
                .http_status
                .map(|c| c.to_string())
                .unwrap_or_else(|| "-".into()),
            d.error.correlation_id.as_deref().unwrap_or("-")
        );
    }

    if !r.caveats.is_empty() {
        let _ = writeln!(s);
        let _ = writeln!(s, "Caveats:");
        for c in &r.caveats {
            let _ = writeln!(s, "  - {c}");
        }
    }
    s
}

fn state_line(st: &ContractState) -> String {
    match st {
        ContractState::Active {
            contract_id,
            template_id,
            ..
        } => format!(
            "{} ACTIVE ({})",
            short_cid(Some(contract_id)),
            template_id.as_deref().unwrap_or("?")
        ),
        ContractState::Archived {
            contract_id,
            archived_at_offset,
            ..
        } => format!(
            "{} ARCHIVED{}",
            short_cid(Some(contract_id)),
            archived_at_offset
                .map(|o| format!(" at offset {o}"))
                .unwrap_or_default()
        ),
        ContractState::Unknown { contract_id } => {
            format!(
                "{} UNKNOWN to this participant",
                short_cid(Some(contract_id))
            )
        }
        ContractState::LookupFailed { contract_id, error } => {
            format!("{} lookup failed: {error}", short_cid(Some(contract_id)))
        }
    }
}

fn short_tpl(t: Option<&str>) -> String {
    match t {
        Some(t) => {
            let mut parts = t.splitn(2, ':');
            let pkg = parts.next().unwrap_or("");
            let rest = parts.next().unwrap_or("");
            if pkg.len() > 12 && !pkg.starts_with('#') {
                format!("{}…:{}", &pkg[..8], rest)
            } else {
                t.to_string()
            }
        }
        None => "?".to_string(),
    }
}

fn short_cid(c: Option<&str>) -> String {
    match c {
        Some(c) if c.len() > 18 => format!("{}…{}", &c[..10], &c[c.len() - 6..]),
        Some(c) => c.to_string(),
        None => "?".to_string(),
    }
}

fn compact(v: &serde_json::Value) -> String {
    let s = v.to_string();
    if s.len() > 200 {
        format!("{}…", &s[..200])
    } else {
        s
    }
}

fn group(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    out
}
