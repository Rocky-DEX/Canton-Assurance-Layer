//! JSON Ledger API v2 client — only the endpoints canton-sim needs.

use async_trait::async_trait;
use canton_sim_diagnose::LedgerError;
use serde_json::{Value, json};
use std::path::PathBuf;
use std::time::Duration;

/// Where the bearer token comes from. Read on every request so rotated
/// token files are picked up without restarting.
#[derive(Debug, Clone)]
pub enum TokenSource {
    None,
    Static(String),
    File(PathBuf),
}

impl TokenSource {
    pub fn read(&self) -> Result<Option<String>, LedgerApiError> {
        match self {
            TokenSource::None => Ok(None),
            TokenSource::Static(t) => Ok(Some(t.trim().to_string()).filter(|t| !t.is_empty())),
            TokenSource::File(p) => {
                let t = std::fs::read_to_string(p).map_err(|e| {
                    LedgerApiError::Config(format!("read token file {}: {e}", p.display()))
                })?;
                Ok(Some(t.trim().to_string()).filter(|t| !t.is_empty()))
            }
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LedgerApiError {
    /// The participant answered with a Canton error.
    #[error("{} {}: {}", .0.http_status.unwrap_or(0), .0.code, .0.cause)]
    Rejected(Box<LedgerError>),
    #[error("transport error calling {url}: {source}")]
    Transport {
        url: String,
        #[source]
        source: reqwest::Error,
    },
    #[error("could not decode response from {url}: {detail}")]
    Decode { url: String, detail: String },
    #[error("configuration error: {0}")]
    Config(String),
}

/// Response of `/v2/interactive-submission/prepare`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrepareResponse {
    pub prepared_transaction_base64: String,
    pub prepared_transaction_hash_base64: String,
    pub hashing_scheme_version: String,
    pub cost_estimation: Option<canton_sim_fee::TrafficCost>,
    pub raw: Value,
}

/// Raw result of `/v2/events/events-by-contract-id`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractEvents {
    pub created: Option<Value>,
    pub archived: Option<Value>,
}

/// The subset of the Ledger API canton-sim relies on. Mocked in tests.
#[async_trait]
pub trait LedgerApi: Send + Sync {
    fn base_url(&self) -> &str;
    async fn prepare(&self, body: &Value) -> Result<PrepareResponse, LedgerApiError>;
    async fn contract_events(
        &self,
        contract_id: &str,
        parties: &[String],
    ) -> Result<ContractEvents, LedgerApiError>;
    async fn version(&self) -> Result<Option<String>, LedgerApiError>;
}

/// reqwest-backed client for the JSON Ledger API (`https://host/v2`).
#[derive(Debug, Clone)]
pub struct JsonLedgerClient {
    base_url: String,
    http: reqwest::Client,
    token: TokenSource,
}

impl JsonLedgerClient {
    /// `base_url` may be given with or without the `/v2` suffix.
    pub fn new(base_url: &str, token: TokenSource) -> Result<Self, LedgerApiError> {
        let mut base = base_url.trim().trim_end_matches('/').to_string();
        if base.is_empty() {
            return Err(LedgerApiError::Config("ledger URL is empty".into()));
        }
        if !base.ends_with("/v2") {
            base.push_str("/v2");
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| LedgerApiError::Config(format!("build HTTP client: {e}")))?;
        Ok(Self {
            base_url: base,
            http,
            token,
        })
    }

    async fn post_json(&self, path: &str, body: &Value) -> Result<Value, LedgerApiError> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.http.post(&url).json(body);
        if let Some(t) = self.token.read()? {
            req = req.bearer_auth(t);
        }
        let resp = req
            .send()
            .await
            .map_err(|source| LedgerApiError::Transport {
                url: url.clone(),
                source,
            })?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(LedgerApiError::Rejected(Box::new(LedgerError::parse(
                Some(status.as_u16()),
                &text,
            ))));
        }
        if text.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&text).map_err(|e| LedgerApiError::Decode {
            url,
            detail: format!("{e}: {}", truncate(&text, 300)),
        })
    }

    async fn get_json(&self, path: &str) -> Result<Value, LedgerApiError> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.http.get(&url);
        if let Some(t) = self.token.read()? {
            req = req.bearer_auth(t);
        }
        let resp = req
            .send()
            .await
            .map_err(|source| LedgerApiError::Transport {
                url: url.clone(),
                source,
            })?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(LedgerApiError::Rejected(Box::new(LedgerError::parse(
                Some(status.as_u16()),
                &text,
            ))));
        }
        serde_json::from_str(&text).map_err(|e| LedgerApiError::Decode {
            url,
            detail: format!("{e}: {}", truncate(&text, 300)),
        })
    }
}

#[async_trait]
impl LedgerApi for JsonLedgerClient {
    fn base_url(&self) -> &str {
        &self.base_url
    }

    async fn prepare(&self, body: &Value) -> Result<PrepareResponse, LedgerApiError> {
        let raw = self
            .post_json("/interactive-submission/prepare", body)
            .await?;
        parse_prepare_response(&self.base_url, raw)
    }

    async fn contract_events(
        &self,
        contract_id: &str,
        parties: &[String],
    ) -> Result<ContractEvents, LedgerApiError> {
        let filters: serde_json::Map<String, Value> = parties
            .iter()
            .map(|p| {
                (
                    p.clone(),
                    json!({"cumulative": [{"identifierFilter": {"WildcardFilter": {"includeCreatedEventBlob": false}}}]}),
                )
            })
            .collect();
        let body = json!({
            "contractId": contract_id,
            "eventFormat": {"filtersByParty": filters, "verbose": false}
        });
        match self.post_json("/events/events-by-contract-id", &body).await {
            Ok(v) => Ok(ContractEvents {
                created: v.get("created").filter(|c| !c.is_null()).cloned(),
                archived: v.get("archived").filter(|c| !c.is_null()).cloned(),
            }),
            Err(LedgerApiError::Rejected(e))
                if e.code == "CONTRACT_EVENTS_NOT_FOUND" || e.http_status == Some(404) =>
            {
                Ok(ContractEvents {
                    created: None,
                    archived: None,
                })
            }
            Err(e) => Err(e),
        }
    }

    async fn version(&self) -> Result<Option<String>, LedgerApiError> {
        let v = self.get_json("/version").await?;
        Ok(v.get("version").and_then(Value::as_str).map(str::to_string))
    }
}

pub(crate) fn parse_prepare_response(
    url: &str,
    raw: Value,
) -> Result<PrepareResponse, LedgerApiError> {
    let field = |name: &str| -> Result<String, LedgerApiError> {
        raw.get(name)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .ok_or_else(|| LedgerApiError::Decode {
                url: url.to_string(),
                detail: format!("prepare response missing `{name}`"),
            })
    };
    let cost_estimation = raw.get("costEstimation").and_then(|c| {
        let req = int_field(c, "confirmationRequestTrafficCostEstimation")?;
        let resp = int_field(c, "confirmationResponseTrafficCostEstimation")?;
        Some(canton_sim_fee::TrafficCost::new(req, resp))
    });
    Ok(PrepareResponse {
        prepared_transaction_base64: field("preparedTransaction")?,
        prepared_transaction_hash_base64: field("preparedTransactionHash")?,
        hashing_scheme_version: field("hashingSchemeVersion")
            .unwrap_or_else(|_| "HASHING_SCHEME_VERSION_UNSPECIFIED".into()),
        cost_estimation,
        raw,
    })
}

fn int_field(v: &Value, name: &str) -> Option<u64> {
    let f = v.get(name)?;
    f.as_u64()
        .or_else(|| f.as_str().and_then(|s| s.parse().ok()))
        .or_else(|| f.as_f64().map(|x| x.max(0.0) as u64))
}

fn truncate(s: &str, n: usize) -> String {
    if s.len() <= n {
        s.to_string()
    } else {
        format!("{}…", &s[..n])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_gets_v2_suffix_once() {
        let c = JsonLedgerClient::new("https://p.example/", TokenSource::None).unwrap();
        assert_eq!(c.base_url(), "https://p.example/v2");
        let c = JsonLedgerClient::new("https://p.example/v2", TokenSource::None).unwrap();
        assert_eq!(c.base_url(), "https://p.example/v2");
    }

    #[test]
    fn prepare_response_parses_cost_estimation() {
        let raw = json!({
            "preparedTransaction": "AAAA",
            "preparedTransactionHash": "BBBB",
            "hashingSchemeVersion": "HASHING_SCHEME_VERSION_V2",
            "costEstimation": {
                "estimationTimestamp": "2026-09-09T00:00:00Z",
                "confirmationRequestTrafficCostEstimation": 4200,
                "confirmationResponseTrafficCostEstimation": "300",
                "totalTrafficCostEstimation": 4500
            }
        });
        let p = parse_prepare_response("u", raw).unwrap();
        assert_eq!(p.cost_estimation.unwrap().total, 4500);
        assert_eq!(p.hashing_scheme_version, "HASHING_SCHEME_VERSION_V2");
    }

    #[test]
    fn prepare_response_requires_transaction() {
        let err = parse_prepare_response("u", json!({"preparedTransactionHash": "x"})).unwrap_err();
        assert!(matches!(err, LedgerApiError::Decode { .. }));
    }
}
