//! Static Canton error-code catalog.
//!
//! Source data: `data/canton-error-catalog.json`, generated from
//! `@Explanation` / `@Resolution` annotations in the Canton `release-line-3.4`
//! sources (202 codes), the Daml 2.10 error-code reference for codes whose
//! definitions have not moved (21 codes) and a handful of hand-written entries
//! for routing/authorization codes whose sources are not in the community
//! tree (marked `source = "manual"`).

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// One catalog entry: what a Canton error code means and how to resolve it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CatalogEntry {
    /// Canton error id, e.g. `CONTRACT_NOT_FOUND`.
    #[serde(default)]
    pub code: String,
    /// Canton error category name, e.g. `InvalidGivenCurrentSystemStateResourceMissing`.
    pub category: String,
    /// Canton's own explanation of the error.
    pub explanation: String,
    /// Canton's own resolution advice.
    pub resolution: String,
    /// Where the entry was extracted from (`canton-3.4:<File>.scala`,
    /// `daml-2.10-docs`, or `manual`).
    pub source: String,
}

static CATALOG: Lazy<BTreeMap<String, CatalogEntry>> = Lazy::new(|| {
    let raw: BTreeMap<String, CatalogEntry> =
        serde_json::from_str(include_str!("../data/canton-error-catalog.json"))
            .expect("embedded canton-error-catalog.json must be valid");
    raw.into_iter()
        .map(|(code, mut entry)| {
            entry.code = code.clone();
            (code, entry)
        })
        .collect()
});

/// The full catalog, keyed by error code.
pub fn catalog() -> &'static BTreeMap<String, CatalogEntry> {
    &CATALOG
}

/// Look up a single code (case-insensitive, surrounding whitespace ignored).
pub fn lookup(code: &str) -> Option<&'static CatalogEntry> {
    let key = code.trim().to_ascii_uppercase();
    CATALOG.get(&key)
}

/// Human-readable name for a numeric Canton error category (1..=14).
pub fn category_name(category: u32) -> &'static str {
    match category {
        1 => "TransientServerFailure",
        2 => "ContentionOnSharedResources",
        3 => "DeadlineExceededRequestStateUnknown",
        4 => "SystemInternalAssumptionViolated",
        5 => "AuthInterceptorInvalidAuthenticationCredentials",
        6 => "InsufficientPermission",
        7 => "SecurityAlert",
        8 => "InvalidIndependentOfSystemState",
        9 => "InvalidGivenCurrentSystemStateOther",
        10 => "InvalidGivenCurrentSystemStateResourceExists",
        11 => "InvalidGivenCurrentSystemStateResourceMissing",
        12 => "InvalidGivenCurrentSystemStateSeekAfterEnd",
        13 => "BackgroundProcessDegradationWarning",
        14 => "InternalUnsupportedOperation",
        _ => "Unknown",
    }
}

/// Whether a Canton error category is one clients are expected to retry.
pub fn category_is_retryable(category: u32) -> bool {
    matches!(category, 1..=3)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_loads_and_has_core_codes() {
        let c = catalog();
        assert!(c.len() > 200, "catalog has {} entries", c.len());
        for code in [
            "CONTRACT_NOT_FOUND",
            "DAML_AUTHORIZATION_ERROR",
            "UNHANDLED_EXCEPTION",
            "DAML_FAILURE",
            "TEMPLATE_PRECONDITION_VIOLATED",
            "SEQUENCER_NOT_ENOUGH_TRAFFIC_CREDIT",
            "PACKAGE_NOT_VETTED_BY_RECIPIENTS",
            "NO_SYNCHRONIZER_FOR_SUBMISSION",
            "PERMISSION_DENIED",
        ] {
            let e = lookup(code).unwrap_or_else(|| panic!("missing {code}"));
            assert_eq!(e.code, code);
            assert!(!e.explanation.is_empty(), "{code} has no explanation");
        }
    }

    #[test]
    fn lookup_is_case_insensitive() {
        assert!(lookup(" contract_not_found ").is_some());
        assert!(lookup("NOT_A_CODE").is_none());
    }
}
