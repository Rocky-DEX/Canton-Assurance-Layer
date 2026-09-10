//! Tolerant parsing of Canton Ledger API errors.
//!
//! The JSON Ledger API returns `JsCantonError` bodies:
//!
//! ```json
//! {"code":"CONTRACT_NOT_FOUND","cause":"Contract could not be found with id 00ab…",
//!  "correlationId":"…","traceId":"…","context":{"category":"11","definite_answer":"false"},
//!  "resources":[["CONTRACT_ID","00ab…"]],"errorCategory":11,"grpcCodeValue":5,
//!  "retryInfo":null,"definiteAnswer":false}
//! ```
//!
//! gRPC clients and log lines instead carry the flattened form
//! `CONTRACT_NOT_FOUND(11,abc12345): Contract could not be found …`. Both are
//! accepted, as is the wrapped form produced by HTTP clients
//! (`… returned 404 Not Found: {json}`), so the classifier can be pointed at
//! whatever text a developer has at hand.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

/// A normalised Canton Ledger API rejection.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct LedgerError {
    /// HTTP status of the JSON API response, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
    /// Canton error id (`CONTRACT_NOT_FOUND`); `UNKNOWN` when none could be found.
    pub code: String,
    /// Free-text cause as returned by the participant.
    pub cause: String,
    /// Numeric Canton error category (1..=14).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_category: Option<u32>,
    /// Numeric gRPC status code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grpc_code: Option<i32>,
    /// Whether the participant states this answer is definite (no retry can
    /// change it).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub definite_answer: Option<bool>,
    /// Suggested retry delay in seconds when the participant provides one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retry_after_secs: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    /// Error context map (`participant`, `tid`, `category`, …).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub context: BTreeMap<String, String>,
    /// Resource references (`[("CONTRACT_ID", "00ab…")]`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub resources: Vec<(String, String)>,
    /// The original error text, verbatim.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub raw: String,
}

impl LedgerError {
    /// Parse an error from an HTTP status and a response body (JSON or text).
    pub fn parse(http_status: Option<u16>, body: &str) -> LedgerError {
        let mut err = parse_inner(body);
        err.http_status = http_status;
        err.raw = body.to_string();
        err
    }

    /// Parse from any text: a JSON body, a gRPC-style message, or an HTTP
    /// client error string that embeds a JSON body.
    pub fn from_text(text: &str) -> LedgerError {
        let status = extract_wrapped_status(text);
        Self::parse(status, text)
    }

    /// Resource value for a given resource type (e.g. `CONTRACT_ID`).
    pub fn resource(&self, kind: &str) -> Option<&str> {
        self.resources
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(kind))
            .map(|(_, v)| v.as_str())
    }
}

fn parse_inner(body: &str) -> LedgerError {
    let trimmed = body.trim();
    if let Some(json) = find_json_object(trimmed)
        && let Ok(v) = serde_json::from_str::<Value>(json)
        && let Some(e) = from_json(&v)
    {
        return e;
    }
    from_grpc_text(trimmed)
}

fn from_json(v: &Value) -> Option<LedgerError> {
    let obj = v.as_object()?;
    let code = obj.get("code")?.as_str()?.trim();
    if code.is_empty() {
        return None;
    }
    let cause = obj
        .get("cause")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let mut context = BTreeMap::new();
    if let Some(ctx) = obj.get("context").and_then(Value::as_object) {
        for (k, val) in ctx {
            context.insert(k.clone(), value_to_string(val));
        }
    }
    let error_category = obj
        .get("errorCategory")
        .and_then(Value::as_u64)
        .map(|c| c as u32)
        .or_else(|| context.get("category").and_then(|c| c.parse().ok()));
    let definite_answer = obj
        .get("definiteAnswer")
        .and_then(Value::as_bool)
        .or_else(|| context.get("definite_answer").and_then(|d| d.parse().ok()));
    let retry_after_secs = obj
        .get("retryInfo")
        .and_then(Value::as_object)
        .and_then(|r| {
            r.get("seconds")
                .and_then(Value::as_f64)
                .or_else(|| r.get("value").and_then(Value::as_f64))
        });
    let mut resources = Vec::new();
    if let Some(arr) = obj.get("resources").and_then(Value::as_array) {
        for item in arr {
            match item {
                Value::Array(pair) if pair.len() == 2 => {
                    resources.push((value_to_string(&pair[0]), value_to_string(&pair[1])));
                }
                Value::Object(o) => {
                    let k = o
                        .get("type")
                        .or_else(|| o.get("resourceType"))
                        .map(value_to_string)
                        .unwrap_or_default();
                    let val = o
                        .get("name")
                        .or_else(|| o.get("value"))
                        .map(value_to_string)
                        .unwrap_or_default();
                    resources.push((k, val));
                }
                _ => {}
            }
        }
    }
    Some(LedgerError {
        http_status: None,
        code: code.to_string(),
        cause,
        error_category,
        grpc_code: obj
            .get("grpcCodeValue")
            .and_then(Value::as_i64)
            .map(|c| c as i32),
        definite_answer,
        retry_after_secs,
        correlation_id: obj
            .get("correlationId")
            .and_then(Value::as_str)
            .map(str::to_string),
        trace_id: obj
            .get("traceId")
            .and_then(Value::as_str)
            .map(str::to_string),
        context,
        resources,
        raw: String::new(),
    })
}

/// `CODE(category,correlation): cause` — the gRPC / log-line form.
fn from_grpc_text(text: &str) -> LedgerError {
    static RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r"(?s)\b([A-Z][A-Z0-9_]{3,})\((\d{1,2}),([0-9a-fA-F]+)\):\s*(.*)$")
            .expect("valid regex")
    });
    if let Some(c) = RE.captures(text) {
        return LedgerError {
            code: c[1].to_string(),
            error_category: c[2].parse().ok(),
            correlation_id: Some(c[3].to_string()),
            cause: c[4].trim().to_string(),
            ..Default::default()
        };
    }
    // Last resort: a bare code somewhere in the text.
    static BARE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r"\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,})\b").expect("valid regex")
    });
    let code = BARE
        .captures_iter(text)
        .map(|c| c[1].to_string())
        .find(|c| super::catalog::lookup(c).is_some())
        .unwrap_or_else(|| "UNKNOWN".to_string());
    LedgerError {
        code,
        cause: text.to_string(),
        ..Default::default()
    }
}

/// `… returned 404 Not Found: {…}` → 404.
fn extract_wrapped_status(text: &str) -> Option<u16> {
    static RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r"\breturned (\d{3})\b").expect("valid regex")
    });
    RE.captures(text).and_then(|c| c[1].parse().ok())
}

/// Locate the outermost `{…}` in a string that may have a text prefix.
fn find_json_object(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    (end > start).then(|| &text[start..=end])
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_api_error_body() {
        let body = r#"{"code":"CONTRACT_NOT_FOUND","cause":"Contract could not be found with id 00aa","correlationId":"c1","traceId":"t1","context":{"participant":"'participant'","category":"11","definite_answer":"false"},"resources":[["CONTRACT_ID","00aa"]],"errorCategory":11,"grpcCodeValue":5,"definiteAnswer":false}"#;
        let e = LedgerError::parse(Some(404), body);
        assert_eq!(e.code, "CONTRACT_NOT_FOUND");
        assert_eq!(e.http_status, Some(404));
        assert_eq!(e.error_category, Some(11));
        assert_eq!(e.grpc_code, Some(5));
        assert_eq!(e.definite_answer, Some(false));
        assert_eq!(e.resource("contract_id"), Some("00aa"));
        assert_eq!(e.correlation_id.as_deref(), Some("c1"));
    }

    #[test]
    fn parses_wrapped_http_client_error() {
        let text = r#"JSON Ledger API POST https://validator.example/v2/commands/submit-and-wait returned 409 Conflict: {"code":"SUBMISSION_ALREADY_IN_FLIGHT","cause":"A submission with the given change ID is already in flight","context":{"category":"2"}}"#;
        let e = LedgerError::from_text(text);
        assert_eq!(e.code, "SUBMISSION_ALREADY_IN_FLIGHT");
        assert_eq!(e.http_status, Some(409));
        assert_eq!(e.error_category, Some(2));
    }

    #[test]
    fn parses_grpc_style_message() {
        let text = "DAML_AUTHORIZATION_ERROR(9,1a2b3c4d): Interpretation error: Error: node NodeId(0) (pkg:M:T) requires authorizers alice::1220, but only bob::1220 were given";
        let e = LedgerError::from_text(text);
        assert_eq!(e.code, "DAML_AUTHORIZATION_ERROR");
        assert_eq!(e.error_category, Some(9));
        assert_eq!(e.correlation_id.as_deref(), Some("1a2b3c4d"));
        assert!(e.cause.starts_with("Interpretation error"));
    }

    #[test]
    fn falls_back_to_bare_code_or_unknown() {
        let e = LedgerError::from_text("something about UNHANDLED_EXCEPTION happened");
        assert_eq!(e.code, "UNHANDLED_EXCEPTION");
        let e = LedgerError::from_text("connection refused");
        assert_eq!(e.code, "UNKNOWN");
    }
}
