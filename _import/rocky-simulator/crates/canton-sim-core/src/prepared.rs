//! Decoding of the base64 `PreparedTransaction` returned by `prepare` into
//! [`Effects`], plus Daml `Value` → JSON conversion.

use crate::model::{EffectCounts, EffectNode, Effects, InputContract, NodeKind};
use base64::Engine;
use canton_sim_proto::interactive::daml_transaction::node::VersionedNode;
use canton_sim_proto::interactive::metadata::input_contract::Contract as InputContractV;
use canton_sim_proto::interactive::{DamlTransaction, PreparedTransaction};
use canton_sim_proto::interactive_tx_v1::node::NodeType;
use canton_sim_proto::prost::Message;
use canton_sim_proto::v2::{Identifier, Value as LfValue, value::Sum};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("preparedTransaction is not valid base64: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("preparedTransaction is not a valid PreparedTransaction protobuf: {0}")]
    Proto(#[from] canton_sim_proto::prost::DecodeError),
    #[error("prepared transaction has no `transaction` field")]
    MissingTransaction,
}

/// Decode base64 → protobuf.
pub fn decode_prepared(base64_tx: &str) -> Result<(PreparedTransaction, usize), DecodeError> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(base64_tx.trim())?;
    let tx = PreparedTransaction::decode(bytes.as_slice())?;
    Ok((tx, bytes.len()))
}

/// Turn a decoded `PreparedTransaction` into ledger [`Effects`].
pub fn effects_of(
    prepared: &PreparedTransaction,
    prepared_size_bytes: usize,
    hash_base64: &str,
    hashing_scheme_version: &str,
    include_arguments: bool,
) -> Result<Effects, DecodeError> {
    let tx = prepared
        .transaction
        .as_ref()
        .ok_or(DecodeError::MissingTransaction)?;
    let meta = prepared.metadata.clone().unwrap_or_default();

    let by_id: BTreeMap<&str, &canton_sim_proto::interactive_tx_v1::Node> = tx
        .nodes
        .iter()
        .filter_map(|n| {
            n.versioned_node
                .as_ref()
                .map(|VersionedNode::V1(v1)| (n.node_id.as_str(), v1))
        })
        .collect();

    let mut nodes = Vec::new();
    let mut counts = EffectCounts::default();
    let mut informees = BTreeSet::new();
    let mut consumed = BTreeSet::new();
    let mut visited = BTreeSet::new();
    for root in &tx.roots {
        walk(
            root,
            0,
            &by_id,
            include_arguments,
            &mut nodes,
            &mut counts,
            &mut informees,
            &mut consumed,
            &mut visited,
        );
    }
    // Nodes unreachable from roots (should not happen) are still listed.
    for n in &tx.nodes {
        if !visited.contains(n.node_id.as_str()) {
            walk(
                &n.node_id,
                0,
                &by_id,
                include_arguments,
                &mut nodes,
                &mut counts,
                &mut informees,
                &mut consumed,
                &mut visited,
            );
        }
    }

    let input_contracts = meta
        .input_contracts
        .iter()
        .map(|ic| {
            let create = ic.contract.as_ref().map(|InputContractV::V1(c)| c);
            let cid = create.map(|c| c.contract_id.clone()).unwrap_or_default();
            InputContract {
                consumed: consumed.contains(&cid),
                contract_id: cid,
                template_id: create
                    .and_then(|c| c.template_id.as_ref())
                    .map(identifier_string),
                created_at: micros_to_rfc3339(ic.created_at),
                signatories: create.map(|c| c.signatories.clone()).unwrap_or_default(),
                stakeholders: create.map(|c| c.stakeholders.clone()).unwrap_or_default(),
            }
        })
        .collect();

    let submitter = meta.submitter_info.clone().unwrap_or_default();
    let hash_hex = base64::engine::general_purpose::STANDARD
        .decode(hash_base64.trim())
        .map(|b| b.iter().map(|x| format!("{x:02x}")).collect::<String>())
        .unwrap_or_default();

    Ok(Effects {
        transaction_version: tx.version.clone(),
        roots: tx.roots.clone(),
        nodes,
        counts,
        informees: informees.into_iter().collect(),
        input_contracts,
        act_as: submitter.act_as,
        command_id: submitter.command_id,
        synchronizer_id: meta.synchronizer_id.clone(),
        mediator_group: meta.mediator_group,
        transaction_uuid: meta.transaction_uuid.clone(),
        preparation_time: micros_to_rfc3339(meta.preparation_time),
        min_ledger_effective_time: meta.min_ledger_effective_time.and_then(micros_to_rfc3339),
        max_ledger_effective_time: meta.max_ledger_effective_time.and_then(micros_to_rfc3339),
        max_record_time: meta.max_record_time.and_then(micros_to_rfc3339),
        prepared_size_bytes,
        prepared_transaction_hash_hex: hash_hex,
        hashing_scheme_version: hashing_scheme_version.to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
fn walk<'a>(
    node_id: &'a str,
    depth: usize,
    by_id: &BTreeMap<&'a str, &'a canton_sim_proto::interactive_tx_v1::Node>,
    include_arguments: bool,
    out: &mut Vec<EffectNode>,
    counts: &mut EffectCounts,
    informees: &mut BTreeSet<String>,
    consumed: &mut BTreeSet<String>,
    visited: &mut BTreeSet<&'a str>,
) {
    if !visited.insert(node_id) {
        return;
    }
    let Some(node) = by_id.get(node_id) else {
        return;
    };
    let arg = |v: &Option<LfValue>| -> Option<Value> {
        if include_arguments {
            v.as_ref().map(value_to_json)
        } else {
            None
        }
    };
    let (effect, children): (EffectNode, Vec<String>) = match &node.node_type {
        Some(NodeType::Create(c)) => {
            counts.creates += 1;
            informees.extend(c.signatories.iter().cloned());
            informees.extend(c.stakeholders.iter().cloned());
            (
                EffectNode {
                    node_id: node_id.to_string(),
                    depth,
                    kind: NodeKind::Create,
                    template_id: c.template_id.as_ref().map(identifier_string),
                    package_name: non_empty(&c.package_name),
                    interface_id: None,
                    contract_id: non_empty(&c.contract_id),
                    choice: None,
                    consuming: None,
                    acting_parties: Vec::new(),
                    signatories: c.signatories.clone(),
                    stakeholders: c.stakeholders.clone(),
                    choice_observers: Vec::new(),
                    argument: arg(&c.argument),
                    result: None,
                    children: Vec::new(),
                },
                Vec::new(),
            )
        }
        Some(NodeType::Exercise(e)) => {
            counts.exercises += 1;
            if e.consuming {
                counts.archives += 1;
                consumed.insert(e.contract_id.clone());
            }
            informees.extend(e.signatories.iter().cloned());
            informees.extend(e.stakeholders.iter().cloned());
            informees.extend(e.acting_parties.iter().cloned());
            informees.extend(e.choice_observers.iter().cloned());
            (
                EffectNode {
                    node_id: node_id.to_string(),
                    depth,
                    kind: NodeKind::Exercise,
                    template_id: e.template_id.as_ref().map(identifier_string),
                    package_name: non_empty(&e.package_name),
                    interface_id: e.interface_id.as_ref().map(identifier_string),
                    contract_id: non_empty(&e.contract_id),
                    choice: non_empty(&e.choice_id),
                    consuming: Some(e.consuming),
                    acting_parties: e.acting_parties.clone(),
                    signatories: e.signatories.clone(),
                    stakeholders: e.stakeholders.clone(),
                    choice_observers: e.choice_observers.clone(),
                    argument: arg(&e.chosen_value),
                    result: arg(&e.exercise_result),
                    children: e.children.clone(),
                },
                e.children.clone(),
            )
        }
        Some(NodeType::Fetch(f)) => {
            counts.fetches += 1;
            informees.extend(f.signatories.iter().cloned());
            informees.extend(f.stakeholders.iter().cloned());
            informees.extend(f.acting_parties.iter().cloned());
            (
                EffectNode {
                    node_id: node_id.to_string(),
                    depth,
                    kind: NodeKind::Fetch,
                    template_id: f.template_id.as_ref().map(identifier_string),
                    package_name: non_empty(&f.package_name),
                    interface_id: f.interface_id.as_ref().map(identifier_string),
                    contract_id: non_empty(&f.contract_id),
                    choice: None,
                    consuming: None,
                    acting_parties: f.acting_parties.clone(),
                    signatories: f.signatories.clone(),
                    stakeholders: f.stakeholders.clone(),
                    choice_observers: Vec::new(),
                    argument: None,
                    result: None,
                    children: Vec::new(),
                },
                Vec::new(),
            )
        }
        Some(NodeType::Rollback(r)) => {
            counts.rollbacks += 1;
            (
                EffectNode {
                    node_id: node_id.to_string(),
                    depth,
                    kind: NodeKind::Rollback,
                    template_id: None,
                    package_name: None,
                    interface_id: None,
                    contract_id: None,
                    choice: None,
                    consuming: None,
                    acting_parties: Vec::new(),
                    signatories: Vec::new(),
                    stakeholders: Vec::new(),
                    choice_observers: Vec::new(),
                    argument: None,
                    result: None,
                    children: r.children.clone(),
                },
                r.children.clone(),
            )
        }
        None => return,
    };
    out.push(effect);
    for child in &children {
        // `children` are owned Strings; look them up by value in the map keys.
        if let Some((key, _)) = by_id.get_key_value(child.as_str()) {
            walk(
                key,
                depth + 1,
                by_id,
                include_arguments,
                out,
                counts,
                informees,
                consumed,
                visited,
            );
        }
    }
}

/// Human/JSON form of an `Identifier`: `pkgid:Module:Entity`.
pub fn identifier_string(id: &Identifier) -> String {
    format!("{}:{}:{}", id.package_id, id.module_name, id.entity_name)
}

fn non_empty(s: &str) -> Option<String> {
    (!s.is_empty()).then(|| s.to_string())
}

/// Microseconds since epoch → RFC 3339, `None` for 0.
pub fn micros_to_rfc3339(micros: u64) -> Option<String> {
    if micros == 0 {
        return None;
    }
    chrono::DateTime::from_timestamp_micros(micros as i64)
        .map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Micros, true))
}

/// Daml-LF `Value` → the JSON Ledger API encoding (records as objects,
/// variants as `{"tag","value"}`, numerics/int64 as strings, …).
pub fn value_to_json(v: &LfValue) -> Value {
    match &v.sum {
        None | Some(Sum::Unit(_)) => json!({}),
        Some(Sum::Bool(b)) => json!(b),
        Some(Sum::Int64(i)) => json!(i.to_string()),
        Some(Sum::Date(d)) => {
            let day = chrono::DateTime::from_timestamp((*d as i64) * 86_400, 0)
                .map(|t| t.format("%Y-%m-%d").to_string())
                .unwrap_or_else(|| d.to_string());
            json!(day)
        }
        Some(Sum::Timestamp(t)) => {
            json!(micros_to_rfc3339(*t as u64).unwrap_or_else(|| t.to_string()))
        }
        Some(Sum::Numeric(n)) => json!(n),
        Some(Sum::Party(p)) => json!(p),
        Some(Sum::Text(t)) => json!(t),
        Some(Sum::ContractId(c)) => json!(c),
        Some(Sum::Optional(o)) => match &o.value {
            Some(inner) => value_to_json(inner),
            None => Value::Null,
        },
        Some(Sum::List(l)) => Value::Array(l.elements.iter().map(value_to_json).collect()),
        Some(Sum::TextMap(m)) => {
            let mut obj = serde_json::Map::new();
            for e in &m.entries {
                obj.insert(
                    e.key.clone(),
                    e.value.as_ref().map(value_to_json).unwrap_or(Value::Null),
                );
            }
            Value::Object(obj)
        }
        Some(Sum::GenMap(m)) => Value::Array(
            m.entries
                .iter()
                .map(|e| {
                    json!([
                        e.key.as_ref().map(value_to_json).unwrap_or(Value::Null),
                        e.value.as_ref().map(value_to_json).unwrap_or(Value::Null)
                    ])
                })
                .collect(),
        ),
        Some(Sum::Record(r)) => {
            let mut obj = serde_json::Map::new();
            for (i, f) in r.fields.iter().enumerate() {
                let label = if f.label.is_empty() {
                    format!("_{i}")
                } else {
                    f.label.clone()
                };
                obj.insert(
                    label,
                    f.value.as_ref().map(value_to_json).unwrap_or(Value::Null),
                );
            }
            Value::Object(obj)
        }
        Some(Sum::Variant(var)) => json!({
            "tag": var.constructor,
            "value": var.value.as_ref().map(|x| value_to_json(x)).unwrap_or(Value::Null)
        }),
        Some(Sum::Enum(e)) => json!(e.constructor),
    }
}

/// Test/fixture helper: build a `PreparedTransaction` from parts. Public so
/// integration tests and the CLI's `effects` subcommand share it.
pub fn encode_prepared(tx: &PreparedTransaction) -> String {
    base64::engine::general_purpose::STANDARD.encode(tx.encode_to_vec())
}

/// Convenience: make a `DamlTransaction` with V1 nodes.
pub fn daml_transaction(
    version: &str,
    roots: Vec<String>,
    nodes: Vec<(String, canton_sim_proto::interactive_tx_v1::Node)>,
) -> DamlTransaction {
    DamlTransaction {
        version: version.to_string(),
        roots,
        nodes: nodes
            .into_iter()
            .map(
                |(node_id, n)| canton_sim_proto::interactive::daml_transaction::Node {
                    node_id,
                    versioned_node: Some(VersionedNode::V1(n)),
                },
            )
            .collect(),
        node_seeds: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use canton_sim_proto::interactive_tx_v1::{Create, Exercise, Node};
    use canton_sim_proto::v2::{Record, RecordField};

    fn ident(m: &str, e: &str) -> Identifier {
        Identifier {
            package_id: "abc".into(),
            module_name: m.into(),
            entity_name: e.into(),
        }
    }

    fn lf(sum: Sum) -> LfValue {
        LfValue { sum: Some(sum) }
    }

    #[test]
    fn value_to_json_covers_daml_json_encoding() {
        let rec = lf(Sum::Record(Record {
            record_id: None,
            fields: vec![
                RecordField {
                    label: "delta".into(),
                    value: Some(lf(Sum::Numeric("10.5".into()))),
                },
                RecordField {
                    label: "n".into(),
                    value: Some(lf(Sum::Int64(7))),
                },
                RecordField {
                    label: "ok".into(),
                    value: Some(lf(Sum::Bool(true))),
                },
                RecordField {
                    label: "when".into(),
                    value: Some(lf(Sum::Timestamp(1_700_000_000_000_000))),
                },
                RecordField {
                    label: "day".into(),
                    value: Some(lf(Sum::Date(0))),
                },
                RecordField {
                    label: "opt".into(),
                    value: Some(lf(Sum::Optional(Box::new(
                        canton_sim_proto::v2::Optional { value: None },
                    )))),
                },
                RecordField {
                    label: "side".into(),
                    value: Some(lf(Sum::Enum(canton_sim_proto::v2::Enum {
                        enum_id: None,
                        constructor: "Buy".into(),
                    }))),
                },
            ],
        }));
        let j = value_to_json(&rec);
        assert_eq!(j["delta"], "10.5");
        assert_eq!(j["n"], "7");
        assert_eq!(j["ok"], true);
        assert_eq!(j["when"], "2023-11-14T22:13:20.000000Z");
        assert_eq!(j["day"], "1970-01-01");
        assert!(j["opt"].is_null());
        assert_eq!(j["side"], "Buy");
    }

    #[test]
    fn effects_walk_roots_and_children() {
        let exercise = Node {
            node_type: Some(NodeType::Exercise(Exercise {
                lf_version: "2.1".into(),
                contract_id: "00aa".into(),
                package_name: "perp-custody".into(),
                template_id: Some(ident("PerpCustody", "PlatformAccount")),
                signatories: vec!["exchange::1".into()],
                stakeholders: vec!["exchange::1".into()],
                acting_parties: vec!["exchange::1".into()],
                interface_id: None,
                choice_id: "Debit".into(),
                chosen_value: Some(lf(Sum::Record(Record {
                    record_id: None,
                    fields: vec![],
                }))),
                consuming: true,
                children: vec!["1".into()],
                exercise_result: Some(lf(Sum::ContractId("00bb".into()))),
                choice_observers: vec![],
            })),
        };
        let create = Node {
            node_type: Some(NodeType::Create(Create {
                lf_version: "2.1".into(),
                contract_id: "00bb".into(),
                package_name: "perp-custody".into(),
                template_id: Some(ident("PerpCustody", "PlatformAccount")),
                argument: None,
                signatories: vec!["exchange::1".into()],
                stakeholders: vec!["exchange::1".into(), "operator::2".into()],
            })),
        };
        let tx = daml_transaction(
            "2.1",
            vec!["0".into()],
            vec![("0".into(), exercise), ("1".into(), create)],
        );
        let prepared = PreparedTransaction {
            transaction: Some(tx),
            metadata: Some(canton_sim_proto::interactive::Metadata {
                submitter_info: Some(canton_sim_proto::interactive::metadata::SubmitterInfo {
                    act_as: vec!["exchange::1".into()],
                    command_id: "cmd-1".into(),
                }),
                synchronizer_id: "global::abc".into(),
                mediator_group: 0,
                transaction_uuid: "u".into(),
                preparation_time: 1_700_000_000_000_000,
                input_contracts: vec![canton_sim_proto::interactive::metadata::InputContract {
                    contract: Some(InputContractV::V1(Create {
                        lf_version: "2.1".into(),
                        contract_id: "00aa".into(),
                        package_name: "perp-custody".into(),
                        template_id: Some(ident("PerpCustody", "PlatformAccount")),
                        argument: None,
                        signatories: vec!["exchange::1".into()],
                        stakeholders: vec!["exchange::1".into()],
                    })),
                    created_at: 1_600_000_000_000_000,
                    event_blob: vec![1, 2, 3],
                }],
                min_ledger_effective_time: None,
                max_ledger_effective_time: None,
                global_key_mapping: vec![],
                max_record_time: Some(1_700_000_600_000_000),
            }),
        };
        let b64 = encode_prepared(&prepared);
        let (decoded, size) = decode_prepared(&b64).unwrap();
        let fx = effects_of(&decoded, size, "AAAA", "HASHING_SCHEME_VERSION_V2", true).unwrap();
        assert_eq!(
            fx.counts,
            EffectCounts {
                creates: 1,
                archives: 1,
                exercises: 1,
                fetches: 0,
                rollbacks: 0
            }
        );
        assert_eq!(fx.nodes.len(), 2);
        assert_eq!(fx.nodes[0].kind, NodeKind::Exercise);
        assert_eq!(fx.nodes[1].kind, NodeKind::Create);
        assert_eq!(fx.nodes[1].depth, 1);
        assert_eq!(
            fx.informees,
            vec!["exchange::1".to_string(), "operator::2".to_string()]
        );
        assert_eq!(fx.input_contracts.len(), 1);
        assert!(fx.input_contracts[0].consumed);
        assert_eq!(fx.command_id, "cmd-1");
        assert_eq!(
            fx.max_record_time.as_deref(),
            Some("2023-11-14T22:23:20.000000Z")
        );
        assert_eq!(fx.nodes[0].result, Some(json!("00bb")));
    }

    #[test]
    fn decode_rejects_garbage() {
        assert!(matches!(
            decode_prepared("not base64!"),
            Err(DecodeError::Base64(_))
        ));
        assert!(matches!(
            decode_prepared("AAECAwQ="),
            Err(DecodeError::Proto(_)) | Ok(_)
        ));
    }
}
