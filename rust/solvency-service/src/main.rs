//! `canton-solvency-service` — the signing side of the hosted console.
//!
//! The only process that holds a signing seed. It takes leaves and metadata
//! from the web tier and returns signed documents as exact bytes; it keeps no
//! tenancy state beyond the keystore and never sees a customer's email or
//! name, only the leaf identity the balance file carried.
//!
//! Configuration, all through the environment:
//!
//!   SERVICE_TOKEN   bearer token the web tier presents (required)
//!   SERVICE_KEK     32-byte hex key-encryption key for the keystore (required)
//!   KEYSTORE_DIR    where sealed seeds live (default ./keystore)
//!   BIND            address to listen on (default 127.0.0.1:8790)

mod api;
mod keystore;

use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use keystore::Keystore;
use serde::Serialize;
use std::sync::Arc;
use subtle::ConstantTimeEq;

#[derive(Clone)]
pub struct AppState {
    keystore: Arc<Keystore>,
    token: Arc<String>,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

/// Every failure is JSON with one `error` string, so the web tier can show
/// the operator the reason instead of a status code.
pub struct AppError(StatusCode, String);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.0, Json(ErrorBody { error: self.1 })).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        // Input problems are the caller's; anything else is ours. The
        // producer library reports both through anyhow, so the message is the
        // best signal available: keystore failures name the KEK or a path.
        let text = format!("{e:#}");
        let status = if text.contains("SERVICE_KEK") || text.contains("keystore") {
            StatusCode::INTERNAL_SERVER_ERROR
        } else {
            StatusCode::BAD_REQUEST
        };
        AppError(status, text)
    }
}

async fn require_token(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let presented = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    let expected = state.token.as_bytes();
    let ok =
        presented.len() == expected.len() && presented.as_bytes().ct_eq(expected).unwrap_u8() == 1;
    if !ok {
        return AppError(
            StatusCode::UNAUTHORIZED,
            "missing or wrong bearer token".into(),
        )
        .into_response();
    }
    next.run(req).await
}

async fn health() -> &'static str {
    "ok"
}

async fn keys(
    State(state): State<AppState>,
    Json(req): Json<api::KeyRequest>,
) -> Result<Json<api::KeyResponse>, AppError> {
    let signer = state.keystore.signer_for(&req.org_id)?;
    Ok(Json(api::KeyResponse {
        public_key: signer.public_key_hex(),
    }))
}

async fn publish_route(
    State(state): State<AppState>,
    Json(req): Json<api::PublishRequest>,
) -> Result<Json<api::PublishResponse>, AppError> {
    let signer = state.keystore.signer_for(&req.org_id)?;
    // The tree over 100k customers is CPU work; keep it off the async threads.
    let resp = tokio::task::spawn_blocking(move || api::do_publish(&req, &signer))
        .await
        .map_err(|e| AppError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;
    Ok(Json(resp))
}

async fn custody_route(
    State(state): State<AppState>,
    Json(req): Json<api::CustodyRequest>,
) -> Result<Json<api::CustodyResponse>, AppError> {
    let signer = state.keystore.signer_for(&req.org_id)?;
    let resp = tokio::task::spawn_blocking(move || api::do_custody(&req, &signer))
        .await
        .map_err(|e| AppError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;
    Ok(Json(resp))
}

pub fn app(state: AppState) -> Router {
    let protected = Router::new()
        .route("/keys", post(keys))
        .route("/publish", post(publish_route))
        .route("/custody", post(custody_route))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_token));
    Router::new()
        .route("/health", get(health))
        .merge(protected)
        // A balance file for a large venue is tens of megabytes as JSON.
        .layer(DefaultBodyLimit::max(256 * 1024 * 1024))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state)
}

fn env_required(name: &str) -> anyhow::Result<String> {
    std::env::var(name).map_err(|_| anyhow::anyhow!("{name} must be set"))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();

    let token = env_required("SERVICE_TOKEN")?;
    if token.len() < 32 {
        anyhow::bail!("SERVICE_TOKEN must be at least 32 characters");
    }
    let kek = env_required("SERVICE_KEK")?;
    let dir = std::env::var("KEYSTORE_DIR").unwrap_or_else(|_| "./keystore".into());
    let bind = std::env::var("BIND").unwrap_or_else(|_| "127.0.0.1:8790".into());

    let state = AppState {
        keystore: Arc::new(Keystore::open(dir, &kek)?),
        token: Arc::new(token),
    };
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!("canton-solvency-service listening on {bind}");
    axum::serve(listener, app(state)).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    const TOKEN: &str = "test-token-test-token-test-token-0000";
    const KEK: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn test_app() -> (Router, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState {
            keystore: Arc::new(Keystore::open(dir.path(), KEK).unwrap()),
            token: Arc::new(TOKEN.into()),
        };
        (app(state), dir)
    }

    async fn call(
        app: Router,
        path: &str,
        token: Option<&str>,
        body: &str,
    ) -> (StatusCode, serde_json::Value) {
        let mut builder = Request::builder()
            .method("POST")
            .uri(path)
            .header(header::CONTENT_TYPE, "application/json");
        if let Some(t) = token {
            builder = builder.header(header::AUTHORIZATION, format!("Bearer {t}"));
        }
        let response = app
            .oneshot(builder.body(Body::from(body.to_string())).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, json)
    }

    #[tokio::test]
    async fn health_needs_no_token_but_everything_else_does() {
        let (app, _dir) = test_app();
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let (status, body) = call(app.clone(), "/keys", None, r#"{"org_id":"o1"}"#).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(body["error"].as_str().unwrap().contains("token"));

        let (status, _) = call(app, "/keys", Some("wrong"), r#"{"org_id":"o1"}"#).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn keys_are_created_once_and_publish_signs_with_them() {
        let (app, _dir) = test_app();
        let (status, key) = call(app.clone(), "/keys", Some(TOKEN), r#"{"org_id":"o1"}"#).await;
        assert_eq!(status, StatusCode::OK);
        let public_key = key["public_key"].as_str().unwrap().to_string();
        assert_eq!(public_key.len(), 64);

        let body = serde_json::json!({
            "org_id": "o1", "publisher": "venue::t",
            "snapshot_time": "2026-09-09T10:00:00Z", "ledger_offset": "000000000000000001",
            "leaves": [{"user_id": "alice", "balances": {"USDA": "1"}}]
        });
        let (status, resp) = call(app, "/publish", Some(TOKEN), &body.to_string()).await;
        assert_eq!(status, StatusCode::OK, "{resp}");
        assert_eq!(resp["public_key"], public_key);
        assert_eq!(resp["files"].as_array().unwrap().len(), 4);
    }

    #[tokio::test]
    async fn a_bad_request_is_a_400_with_a_reason() {
        let (app, _dir) = test_app();
        let body = serde_json::json!({
            "org_id": "o1", "publisher": "venue::t",
            "snapshot_time": "2026-09-09T10:00:00Z", "ledger_offset": "1",
            "leaves": [{"user_id": "alice", "balances": {"USDA": "one"}}]
        });
        let (status, resp) = call(app, "/publish", Some(TOKEN), &body.to_string()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(resp["error"].as_str().unwrap().contains("alice"));
    }
}
