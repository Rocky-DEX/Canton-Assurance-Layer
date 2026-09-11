//! The HTTP surface end to end: a mock JSON Ledger API behind the router, driven
//! with `tower::ServiceExt::oneshot` so no port is opened for the server itself.
//!
//! With `CANTON_SIM_WRITE_FIXTURES=<dir>` (relative to the repository root)
//! the two simulation reports are also written there;
//! `fixtures/simulator/reports/` is generated that way and the console's
//! render test reads it.

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use axum::{Json, Router, extract::State, routing::post};
use canton_sim_core::prepared::{daml_transaction, encode_prepared};
use canton_sim_fee::FeeSchedule;
use canton_sim_proto::interactive::metadata::input_contract::Contract as InputContractV;
use canton_sim_proto::interactive::{Metadata, PreparedTransaction, metadata};
use canton_sim_proto::interactive_tx_v1::{Create, Exercise, Node, node::NodeType};
use canton_sim_proto::v2::{Identifier, Record, RecordField, Value as LfValue, value::Sum};
use canton_sim_server::{AppState, Config, app};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

type Handler = Arc<dyn Fn(&Value) -> (StatusCode, Value) + Send + Sync>;

#[derive(Clone)]
struct Mock {
    prepare: Handler,
    events: Handler,
}

async fn prepare_handler(State(m): State<Mock>, Json(b): Json<Value>) -> (StatusCode, Json<Value>) {
    let (s, v) = (m.prepare)(&b);
    (s, Json(v))
}

async fn events_handler(State(m): State<Mock>, Json(b): Json<Value>) -> (StatusCode, Json<Value>) {
    let (s, v) = (m.events)(&b);
    (s, Json(v))
}

async fn serve_ledger(mock: Mock) -> String {
    let router = Router::new()
        .route("/v2/interactive-submission/prepare", post(prepare_handler))
        .route("/v2/events/events-by-contract-id", post(events_handler))
        .with_state(mock);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    format!("http://{addr}")
}

fn server(ledger: &str) -> Router {
    app(AppState {
        cfg: Config {
            listen: "127.0.0.1:0".into(),
            ledger: ledger.into(),
            token: Some("server-token".into()),
            token_file: None,
            user_id: Some("canton-sim".into()),
            scan: None,
            forward_auth: true,
            cors_origins: vec![],
        },
        schedule: FeeSchedule::splice_defaults(),
    })
}

async fn call(router: Router, req: Request<Body>) -> (StatusCode, Value) {
    let res = router.oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let body =
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(String::from_utf8_lossy(&bytes)));
    (status, body)
}

fn post_json(path: &str, body: Value) -> Request<Body> {
    Request::post(path)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn ident(m: &str, e: &str) -> Identifier {
    Identifier {
        package_id: "a".repeat(64),
        module_name: m.into(),
        entity_name: e.into(),
    }
}

fn debit_prepared() -> PreparedTransaction {
    let exercise = Node {
        node_type: Some(NodeType::Exercise(Exercise {
            lf_version: "2.1".into(),
            contract_id: "00aa11223344556677889900aabbccddeeff00112233445566778899".into(),
            package_name: "perp-custody".into(),
            template_id: Some(ident("PerpCustody", "PlatformAccount")),
            signatories: vec!["exchange::1220ex".into()],
            stakeholders: vec!["exchange::1220ex".into(), "user::1220us".into()],
            acting_parties: vec!["exchange::1220ex".into()],
            interface_id: None,
            choice_id: "Debit".into(),
            chosen_value: Some(LfValue {
                sum: Some(Sum::Record(Record {
                    record_id: None,
                    fields: vec![
                        RecordField {
                            label: "delta".into(),
                            value: Some(LfValue {
                                sum: Some(Sum::Numeric("25.0".into())),
                            }),
                        },
                        RecordField {
                            label: "chain_tx_id".into(),
                            value: Some(LfValue {
                                sum: Some(Sum::Text("canton-sim-dry-run".into())),
                            }),
                        },
                    ],
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
            contract_id: "00bb11223344556677889900aabbccddeeff00112233445566778899".into(),
            package_name: "perp-custody".into(),
            template_id: Some(ident("PerpCustody", "PlatformAccount")),
            argument: Some(LfValue {
                sum: Some(Sum::Record(Record {
                    record_id: None,
                    fields: vec![RecordField {
                        label: "balance".into(),
                        value: Some(LfValue {
                            sum: Some(Sum::Numeric("975.0".into())),
                        }),
                    }],
                })),
            }),
            signatories: vec!["exchange::1220ex".into()],
            stakeholders: vec!["exchange::1220ex".into(), "user::1220us".into()],
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
                act_as: vec!["exchange::1220ex".into()],
                command_id: "c".into(),
            }),
            synchronizer_id: "global-synchronizer::1220abc".into(),
            mediator_group: 0,
            transaction_uuid: "3f1c0e7a-0000-4000-8000-000000000001".into(),
            preparation_time: 1_700_000_000_000_000,
            input_contracts: vec![metadata::InputContract {
                contract: Some(InputContractV::V1(Create {
                    lf_version: "2.1".into(),
                    contract_id: "00aa11223344556677889900aabbccddeeff00112233445566778899".into(),
                    package_name: "perp-custody".into(),
                    template_id: Some(ident("PerpCustody", "PlatformAccount")),
                    argument: None,
                    signatories: vec!["exchange::1220ex".into()],
                    stakeholders: vec!["exchange::1220ex".into(), "user::1220us".into()],
                })),
                created_at: 1,
                event_blob: vec![0],
            }],
            min_ledger_effective_time: Some(1_700_000_000_000_000),
            max_ledger_effective_time: Some(1_700_000_060_000_000),
            global_key_mapping: vec![],
            max_record_time: Some(1_700_000_600_000_000),
        }),
    }
}

fn debit_request() -> Value {
    json!({
        "act_as": ["exchange::1220ex"],
        "commands": [{"ExerciseCommand": {
            "templateId": "#perp-custody:PerpCustody:PlatformAccount",
            "contractId": "00aa11223344556677889900aabbccddeeff00112233445566778899",
            "choice": "Debit",
            "choiceArgument": {"delta": "25.0", "chain_tx_id": "canton-sim-dry-run"}
        }}]
    })
}

fn write_fixture(name: &str, report: &Value) {
    if let Ok(dir) = std::env::var("CANTON_SIM_WRITE_FIXTURES") {
        // A relative directory is taken from the repository root, not from the
        // crate directory cargo runs tests in.
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join(dir);
        let path = dir.join(name);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            &path,
            format!("{}\n", serde_json::to_string_pretty(report).unwrap()),
        )
        .unwrap();
        eprintln!("wrote {}", path.display());
    }
}

#[tokio::test]
async fn simulate_reports_success_with_effects_and_traffic() {
    let b64 = encode_prepared(&debit_prepared());
    let ledger = serve_ledger(Mock {
        prepare: Arc::new(move |body| {
            assert_eq!(body["actAs"], json!(["exchange::1220ex"]));
            (
                StatusCode::OK,
                json!({
                    "preparedTransaction": b64,
                    "preparedTransactionHash": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                    "hashingSchemeVersion": "HASHING_SCHEME_VERSION_V2",
                    "costEstimation": {
                        "estimationTimestamp": "2026-09-10T00:00:00Z",
                        "confirmationRequestTrafficCostEstimation": 4000,
                        "confirmationResponseTrafficCostEstimation": 1000,
                        "totalTrafficCostEstimation": 5000
                    }
                }),
            )
        }),
        events: Arc::new(|_| panic!("no lookup on success")),
    })
    .await;
    let (status, report) = call(server(&ledger), post_json("/v1/simulate", debit_request())).await;
    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["outcome"], json!("would_succeed"));
    assert_eq!(report["effects"]["counts"]["creates"], json!(1));
    assert_eq!(report["effects"]["counts"]["archives"], json!(1));
    assert_eq!(report["effects"]["nodes"][0]["choice"], json!("Debit"));
    assert_eq!(
        report["effects"]["nodes"][0]["argument"]["delta"],
        json!("25.0")
    );
    assert_eq!(report["traffic"]["cost"]["total"], json!(5000));
    assert_eq!(
        report["traffic"]["pricing"]["source"],
        json!("splice-defaults")
    );
    assert!(report.get("diagnosis").is_none());
    write_fixture("would-succeed.json", &report);
}

#[tokio::test]
async fn simulate_reports_rejection_with_diagnosis_and_contract_state() {
    let ledger = serve_ledger(Mock {
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
        events: Arc::new(|_| {
            (
                StatusCode::OK,
                json!({
                    "created": {"createdEvent": {"contractId": "00aa11223344556677889900aabbccddeeff00112233445566778899", "templateId": "pkg:PerpCustody:PlatformAccount", "offset": 100}},
                    "archived": {"archivedEvent": {"contractId": "00aa11223344556677889900aabbccddeeff00112233445566778899", "offset": 123}}
                }),
            )
        }),
    })
    .await;
    let (status, report) = call(server(&ledger), post_json("/v1/simulate", debit_request())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(report["outcome"], json!("would_fail"));
    assert_eq!(report["diagnosis"]["code"], json!("CONTRACT_NOT_FOUND"));
    assert_eq!(report["diagnosis"]["phase"], json!("interpretation"));
    assert_eq!(report["contract_states"][0]["state"], json!("archived"));
    assert_eq!(
        report["contract_states"][0]["archived_at_offset"],
        json!(123)
    );
    assert!(
        report["diagnosis"]["hints"][0]
            .as_str()
            .unwrap()
            .contains("ARCHIVED at offset 123")
    );
    write_fixture("would-fail.json", &report);
}

#[tokio::test]
async fn simulate_rejects_empty_requests_and_renders_text_on_request() {
    let ledger = serve_ledger(Mock {
        prepare: Arc::new(|_| (StatusCode::OK, json!({}))),
        events: Arc::new(|_| (StatusCode::OK, json!({}))),
    })
    .await;
    let (status, body) = call(
        server(&ledger),
        post_json("/v1/simulate", json!({"act_as": [], "commands": []})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("non-empty"));

    // An empty 200 from the participant is not a success the server has seen.
    let req = Request::post("/v1/simulate")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ACCEPT, "text/plain")
        .body(Body::from(debit_request().to_string()))
        .unwrap();
    let res = server(&ledger).oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert!(
        res.headers()[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("text/plain")
    );
    let text =
        String::from_utf8(res.into_body().collect().await.unwrap().to_bytes().to_vec()).unwrap();
    assert!(text.contains("INCONCLUSIVE"), "{text}");
}

#[tokio::test]
async fn explain_catalog_and_fee_need_no_participant() {
    let ledger = "http://127.0.0.1:1";
    let (status, d) = call(
        server(ledger),
        post_json("/v1/explain", json!({"error": "DAML_AUTHORIZATION_ERROR"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(d["code"], json!("DAML_AUTHORIZATION_ERROR"));
    assert_eq!(d["phase"], json!("authorization"));

    let (status, e) = call(
        server(ledger),
        Request::get("/v1/catalog/CONTRACT_NOT_FOUND")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(e["explanation"].as_str().unwrap().len() > 20);
    let (status, _) = call(
        server(ledger),
        Request::get("/v1/catalog/NOT_A_CODE")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, q) = call(
        server(ledger),
        post_json(
            "/v1/fee",
            json!({"request_bytes": 4200, "response_bytes": 300, "transfer_cc": ["10000"]}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{q}");
    assert_eq!(q["traffic"]["cost"]["total"], json!(4500));
    assert_eq!(q["amulet_fee"]["outputs"], json!(2));
    assert_eq!(q["schedule"]["traffic"]["source"], json!("splice-defaults"));
    let (status, err) = call(server(ledger), post_json("/v1/fee", json!({}))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(err["error"].as_str().unwrap().contains("transfer_cc"));

    let (status, s) = call(
        server(ledger),
        Request::get("/v1/fee-schedule")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(s["amulet"]["create_fee_usd"].is_string());
}

#[test]
fn cors_is_off_unless_origins_are_configured() {
    use canton_sim_server::cors_layer;
    assert!(cors_layer(&[]).is_none());
    assert!(cors_layer(&["".into()]).is_none());
    assert!(cors_layer(&["*".into()]).is_some());
    assert!(
        cors_layer(&[
            "https://console.example".into(),
            " https://ops.example ".into()
        ])
        .is_some()
    );
}
