//! `canton-sim-server` — HTTP front for canton-sim. The router is built here so
//! the integration tests can drive it without a socket; `main.rs` only parses
//! the configuration and serves it.
//!
//! Endpoints:
//! - `POST /v1/simulate`   body: `SimulationRequest`; optional `Authorization: Bearer …`
//!   header is forwarded to the participant (otherwise the server's token is used).
//! - `POST /v1/explain`    body: `{ "error": "<code | json | log line>" }`
//! - `GET  /v1/catalog`    the error catalog; `GET /v1/catalog/{code}` one entry
//! - `POST /v1/fee`        body: `{ request_bytes?, response_bytes?, transfer_cc?: [..] }` —
//!   a standalone quote without a participant (what `canton-sim fee` prints)
//! - `GET  /v1/fee-schedule` the fee schedule in use
//! - `GET  /healthz`

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use canton_sim_core::render::report_to_text;
use canton_sim_core::{JsonLedgerClient, SimulationRequest, Simulator, TokenSource};
use canton_sim_diagnose::{LedgerError, catalog, diagnose, lookup};
use canton_sim_fee::{FeeSchedule, quote_standalone};
use clap::Parser;
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[derive(Parser, Clone, Debug)]
#[command(name = "canton-sim-server", version)]
pub struct Config {
    /// Listen address.
    #[arg(long, env = "CANTON_SIM_LISTEN", default_value = "127.0.0.1:8787")]
    pub listen: String,
    /// JSON Ledger API base URL of the participant to simulate against.
    #[arg(long, env = "CANTON_SIM_LEDGER_URL")]
    pub ledger: String,
    /// Server-side bearer token (used when the request has no Authorization header).
    #[arg(long, env = "CANTON_SIM_TOKEN")]
    pub token: Option<String>,
    #[arg(long, env = "CANTON_SIM_TOKEN_FILE")]
    pub token_file: Option<PathBuf>,
    /// Default Ledger API user id.
    #[arg(long, env = "CANTON_SIM_USER_ID")]
    pub user_id: Option<String>,
    /// Scan base URL to load the live fee schedule at startup.
    #[arg(long, env = "CANTON_SIM_SCAN_URL")]
    pub scan: Option<String>,
    /// Allow callers to pass their own bearer token (forwarded to the participant).
    #[arg(long, env = "CANTON_SIM_FORWARD_AUTH", default_value_t = true)]
    pub forward_auth: bool,
    /// Browser origins allowed to call the API directly (comma-separated), or
    /// `*` for any. Empty, the default, sends no CORS headers at all: a
    /// server-side caller such as the console needs none, and a browser on
    /// another origin should not be able to use a forwarded token.
    #[arg(
        long,
        env = "CANTON_SIM_CORS_ORIGINS",
        value_delimiter = ',',
        default_value = ""
    )]
    pub cors_origins: Vec<String>,
}

#[derive(Clone)]
pub struct AppState {
    pub cfg: Config,
    pub schedule: FeeSchedule,
}

/// The full router: every endpoint, request tracing, and CORS only when
/// origins were configured.
pub fn app(state: AppState) -> Router {
    let cors = cors_layer(&state.cfg.cors_origins);
    let router = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/v1/simulate", post(simulate))
        .route("/v1/explain", post(explain))
        .route("/v1/catalog", get(catalog_all))
        .route("/v1/catalog/{code}", get(catalog_one))
        .route("/v1/fee", post(fee))
        .route("/v1/fee-schedule", get(fee_schedule));
    let router = match cors {
        Some(layer) => router.layer(layer),
        None => router,
    };
    router.layer(TraceLayer::new_for_http()).with_state(state)
}

/// `None` for no CORS headers; `*` for any origin; otherwise the listed
/// origins with the two methods and two headers the API uses.
pub fn cors_layer(origins: &[String]) -> Option<CorsLayer> {
    let origins: Vec<&str> = origins
        .iter()
        .map(|o| o.trim())
        .filter(|o| !o.is_empty())
        .collect();
    if origins.is_empty() {
        return None;
    }
    if origins.contains(&"*") {
        return Some(CorsLayer::permissive());
    }
    let values: Vec<HeaderValue> = origins
        .iter()
        .filter_map(|o| HeaderValue::from_str(o).ok())
        .collect();
    Some(
        CorsLayer::new()
            .allow_origin(values)
            .allow_methods([Method::GET, Method::POST])
            .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]),
    )
}

fn token_for(state: &AppState, headers: &HeaderMap) -> TokenSource {
    if state.cfg.forward_auth
        && let Some(t) = headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
    {
        return TokenSource::Static(t.to_string());
    }
    match (&state.cfg.token, &state.cfg.token_file) {
        (Some(t), _) => TokenSource::Static(t.clone()),
        (None, Some(f)) => TokenSource::File(f.clone()),
        (None, None) => TokenSource::None,
    }
}

fn wants_text(headers: &HeaderMap) -> bool {
    headers
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .map(|a| a.starts_with("text/plain"))
        .unwrap_or(false)
}

async fn simulate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<SimulationRequest>,
) -> Response {
    if req.act_as.is_empty() || req.commands.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "act_as and commands must be non-empty"})),
        )
            .into_response();
    }
    let client = match JsonLedgerClient::new(&state.cfg.ledger, token_for(&state, &headers)) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };
    let sim = Simulator::new(Arc::new(client), state.schedule.clone())
        .with_default_user_id(state.cfg.user_id.clone());
    let report = sim.simulate(req).await;
    if wants_text(&headers) {
        return (
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            report_to_text(&report),
        )
            .into_response();
    }
    Json(report).into_response()
}

#[derive(Deserialize)]
struct ExplainBody {
    error: String,
}

async fn explain(Json(body): Json<ExplainBody>) -> Response {
    let d = diagnose(&LedgerError::from_text(body.error.trim()));
    Json(d).into_response()
}

async fn catalog_all() -> Response {
    Json(catalog().values().collect::<Vec<_>>()).into_response()
}

async fn catalog_one(Path(code): Path<String>) -> Response {
    match lookup(&code) {
        Some(e) => Json(e).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "unknown code"})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct FeeBody {
    #[serde(default)]
    request_bytes: u64,
    #[serde(default)]
    response_bytes: u64,
    #[serde(default)]
    transfer_cc: Vec<Decimal>,
}

async fn fee(State(state): State<AppState>, Json(body): Json<FeeBody>) -> Response {
    match quote_standalone(
        &state.schedule,
        body.request_bytes,
        body.response_bytes,
        &body.transfer_cc,
    ) {
        Some(q) => Json(q).into_response(),
        None => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "give request_bytes/response_bytes and/or transfer_cc"})),
        )
            .into_response(),
    }
}

async fn fee_schedule(State(state): State<AppState>) -> Response {
    Json(state.schedule).into_response()
}
