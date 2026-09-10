//! End-to-end tests against a mock JSON Ledger API served by axum.

use axum::{Json, Router, extract::State, http::StatusCode, routing::post};
use canton_sim_core::prepared::{daml_transaction, encode_prepared};
use canton_sim_core::{
    ContractState, JsonLedgerClient, Outcome, SimulationRequest, Simulator, TokenSource,
};
use canton_sim_diagnose::Phase;
use canton_sim_fee::FeeSchedule;
use canton_sim_proto::interactive::metadata::input_contract::Contract as InputContractV;
use canton_sim_proto::interactive::{Metadata, PreparedTransaction, metadata};
use canton_sim_proto::interactive_tx_v1::{Create, Exercise, Node, node::NodeType};
use canton_sim_proto::v2::{Identifier, Record, RecordField, Value as LfValue, value::Sum};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

type Handler = Arc<dyn Fn(&Value) -> (StatusCode, Value) + Send + Sync>;

#[derive(Clone)]
struct Mock {
    prepare: Handler,
    events: Handler,
    seen: Arc<Mutex<Vec<Value>>>,
}

async fn prepare_handler(
    State(m): State<Mock>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    m.seen.lock().unwrap().push(body.clone());
    let (s, v) = (m.prepare)(&body);
    (s, Json(v))
}

async fn events_handler(
    State(m): State<Mock>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    let (s, v) = (m.events)(&body);
    (s, Json(v))
}

async fn serve(mock: Mock) -> String {
    let app = Router::new()
        .route("/v2/interactive-submission/prepare", post(prepare_handler))
        .route("/v2/events/events-by-contract-id", post(events_handler))
        .with_state(mock);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

fn ident(m: &str, e: &str) -> Identifier {
    Identifier {
        package_id: "a".repeat(64),
        module_name: m.into(),
        entity_name: e.into(),
    }
}

fn numeric(s: &str) -> LfValue {
    LfValue {
        sum: Some(Sum::Numeric(s.into())),
    }
}

fn debit_prepared() -> PreparedTransaction {
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
            chosen_value: Some(LfValue {
                sum: Some(Sum::Record(Record {
                    record_id: None,
                    fields: vec![RecordField {
                        label: "delta".into(),
                        value: Some(numeric("10.0")),
                    }],
                })),
            }),
            consuming: true,
            children: vec!["1".into()],
            exercise_result: None,
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
            stakeholders: vec!["exchange::1".into()],
        })),
    };
    PreparedTransaction {
        transaction: Some(daml_transaction(
            "2.1",
            vec!["0".into()],
            vec![("0".into(), exercise), ("1".into(), create)],
        )),
        metadata: Some(Metadata {
            submitter_info: Some(metadata::SubmitterInfo {
                act_as: vec!["exchange::1".into()],
                command_id: "c".into(),
            }),
            synchronizer_id: "global-synchronizer::1220abc".into(),
            mediator_group: 0,
            transaction_uuid: "u".into(),
            preparation_time: 1_700_000_000_000_000,
            input_contracts: vec![metadata::InputContract {
                contract: Some(InputContractV::V1(Create {
                    lf_version: "2.1".into(),
                    contract_id: "00aa".into(),
                    package_name: "perp-custody".into(),
                    template_id: Some(ident("PerpCustody", "PlatformAccount")),
                    argument: None,
                    signatories: vec!["exchange::1".into()],
                    stakeholders: vec!["exchange::1".into()],
                })),
                created_at: 1,
                event_blob: vec![0],
            }],
            min_ledger_effective_time: None,
            max_ledger_effective_time: None,
            global_key_mapping: vec![],
            max_record_time: Some(1_700_000_600_000_000),
        }),
    }
}

fn debit_request() -> SimulationRequest {
    SimulationRequest::new(
        vec!["exchange::1".into()],
        vec![json!({"ExerciseCommand": {
            "templateId": "#perp-custody:PerpCustody:PlatformAccount",
            "contractId": "00aa",
            "choice": "Debit",
            "choiceArgument": {"delta": "10.0", "chain_tx_id": "tx"}
        }})],
    )
}

#[tokio::test]
async fn successful_prepare_yields_effects_and_traffic() {
    let b64 = encode_prepared(&debit_prepared());
    let mock = Mock {
        prepare: Arc::new(move |_| {
            (
                StatusCode::OK,
                json!({
                    "preparedTransaction": b64,
                    "preparedTransactionHash": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                    "hashingSchemeVersion": "HASHING_SCHEME_VERSION_V2",
                    "costEstimation": {
                        "estimationTimestamp": "2026-09-09T00:00:00Z",
                        "confirmationRequestTrafficCostEstimation": 4000,
                        "confirmationResponseTrafficCostEstimation": 1000,
                        "totalTrafficCostEstimation": 5000
                    }
                }),
            )
        }),
        events: Arc::new(|_| {
            (
                StatusCode::NOT_FOUND,
                json!({"code": "CONTRACT_EVENTS_NOT_FOUND", "cause": "x"}),
            )
        }),
        seen: Arc::new(Mutex::new(vec![])),
    };
    let seen = mock.seen.clone();
    let url = serve(mock).await;
    let client = JsonLedgerClient::new(&url, TokenSource::Static("tok".into())).unwrap();
    let sim = Simulator::new(Arc::new(client), FeeSchedule::splice_defaults())
        .with_default_user_id(Some("canton-sim".into()));

    let report = sim.simulate(debit_request()).await;
    assert_eq!(report.outcome, Outcome::WouldSucceed, "{report:?}");
    let fx = report.effects.as_ref().unwrap();
    assert_eq!(fx.counts.creates, 1);
    assert_eq!(fx.counts.archives, 1);
    assert_eq!(fx.nodes[0].choice.as_deref(), Some("Debit"));
    assert_eq!(fx.nodes[0].argument, Some(json!({"delta": "10.0"})));
    assert!(fx.input_contracts[0].consumed);
    let t = report.traffic.as_ref().unwrap();
    assert_eq!(t.cost.total, 5000);
    assert_eq!(t.cc.normalize().to_string(), "60");
    assert!(
        report
            .caveats
            .iter()
            .any(|c| c.contains("routed to global-synchronizer"))
    );
    assert!(report.amulet_fee.is_none());

    // The request body must be a valid JsPrepareSubmissionRequest.
    let body = seen.lock().unwrap()[0].clone();
    assert_eq!(body["actAs"], json!(["exchange::1"]));
    assert_eq!(body["userId"], json!("canton-sim"));
    assert!(
        body["commandId"]
            .as_str()
            .unwrap()
            .starts_with("canton-sim-")
    );
    assert_eq!(body["estimateTrafficCost"]["disabled"], json!(false));
    assert_eq!(body["commands"].as_array().unwrap().len(), 1);

    let text = canton_sim_core::render::report_to_text(&report);
    assert!(text.contains("WOULD SUCCEED"));
    assert!(text.contains("Exercise"));
    assert!(text.contains("Traffic: 5,000 bytes"));
}

#[tokio::test]
async fn rejected_prepare_is_diagnosed_and_contract_looked_up() {
    let mock = Mock {
        prepare: Arc::new(|_| {
            (
                StatusCode::NOT_FOUND,
                json!({
                    "code": "CONTRACT_NOT_FOUND",
                    "cause": "Contract could not be found with id 00aa11223344556677889900aabbccddeeff00112233445566778899",
                    "correlationId": "corr-1",
                    "context": {"category": "11", "definite_answer": "false"},
                    "resources": [["CONTRACT_ID", "00aa11223344556677889900aabbccddeeff00112233445566778899"]],
                    "errorCategory": 11
                }),
            )
        }),
        events: Arc::new(|body| {
            assert_eq!(
                body["contractId"],
                json!("00aa11223344556677889900aabbccddeeff00112233445566778899")
            );
            assert!(body["eventFormat"]["filtersByParty"]["exchange::1"].is_object());
            (
                StatusCode::OK,
                json!({
                    "created": {"createdEvent": {"contractId": "00aa…", "templateId": "pkg:PerpCustody:PlatformAccount", "offset": 100}},
                    "archived": {"archivedEvent": {"contractId": "00aa…", "offset": 123}}
                }),
            )
        }),
        seen: Arc::new(Mutex::new(vec![])),
    };
    let url = serve(mock).await;
    let client = JsonLedgerClient::new(&url, TokenSource::None).unwrap();
    let sim = Simulator::new(Arc::new(client), FeeSchedule::splice_defaults());

    let report = sim.simulate(debit_request()).await;
    assert_eq!(report.outcome, Outcome::WouldFail);
    let d = report.diagnosis.as_ref().unwrap();
    assert_eq!(d.code, "CONTRACT_NOT_FOUND");
    assert_eq!(d.phase, Phase::Interpretation);
    assert_eq!(d.error.http_status, Some(404));
    assert_eq!(report.contract_states.len(), 1);
    match &report.contract_states[0] {
        ContractState::Archived {
            archived_at_offset,
            template_id,
            ..
        } => {
            assert_eq!(*archived_at_offset, Some(123));
            assert_eq!(
                template_id.as_deref(),
                Some("pkg:PerpCustody:PlatformAccount")
            );
        }
        other => panic!("expected archived, got {other:?}"),
    }
    assert!(
        d.hints[0].contains("ARCHIVED at offset 123"),
        "{:?}",
        d.hints
    );
    let text = canton_sim_core::render::report_to_text(&report);
    assert!(text.contains("WOULD FAIL at Daml interpretation"));
    assert!(text.contains("ARCHIVED at offset 123"));
}

#[tokio::test]
async fn assertion_failures_do_not_trigger_lookups_without_ids() {
    let mock = Mock {
        prepare: Arc::new(|_| {
            (
                StatusCode::BAD_REQUEST,
                json!({
                    "code": "UNHANDLED_EXCEPTION",
                    "cause": "Interpretation error: Error: Unhandled Daml exception: DA.Exception.AssertionFailed:AssertionFailed@abc{ message = \"Insufficient balance\" }.",
                    "context": {"category": "9"},
                    "errorCategory": 9
                }),
            )
        }),
        events: Arc::new(|_| panic!("no lookup expected")),
        seen: Arc::new(Mutex::new(vec![])),
    };
    let url = serve(mock).await;
    let client = JsonLedgerClient::new(&url, TokenSource::None).unwrap();
    let sim = Simulator::new(Arc::new(client), FeeSchedule::splice_defaults());
    let report = sim.simulate(debit_request()).await;
    assert_eq!(report.outcome, Outcome::WouldFail);
    let d = report.diagnosis.as_ref().unwrap();
    assert_eq!(d.extracted.message.as_deref(), Some("Insufficient balance"));
    assert!(report.contract_states.is_empty());
}

#[tokio::test]
async fn unreachable_participant_is_inconclusive() {
    let client = JsonLedgerClient::new("http://127.0.0.1:1", TokenSource::None).unwrap();
    let sim = Simulator::new(Arc::new(client), FeeSchedule::splice_defaults());
    let report = sim.simulate(debit_request()).await;
    assert_eq!(report.outcome, Outcome::Inconclusive);
    assert!(report.caveats[0].contains("could not run the simulation"));
}
