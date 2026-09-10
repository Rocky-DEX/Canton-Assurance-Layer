//! Failure explanation for Canton transactions.
//!
//! The crate has three layers:
//!
//! 1. [`mod@catalog`] — a static catalog of Canton error codes (id, category,
//!    explanation, resolution) extracted from the Canton 3.4 sources and the
//!    Daml error-code reference. This is the "what does this code mean" layer.
//! 2. [`ledger_error`] — tolerant parsing of a JSON Ledger API error body
//!    (`JsCantonError`) or a gRPC-style error string into a [`LedgerError`].
//! 3. [`classify`] — maps a [`LedgerError`] to a [`Diagnosis`]: the failure
//!    phase, a one-line title, extracted facts (template, choice, contract id,
//!    missing authorizers, assertion message, ...) and concrete hints.
//!
//! Everything here is pure and synchronous; ledger lookups that enrich a
//! diagnosis (e.g. "was this contract archived?") live in `canton-sim-core`.

pub mod catalog;
pub mod classify;
pub mod ledger_error;

pub use catalog::{CatalogEntry, catalog, lookup};
pub use classify::{Diagnosis, Extracted, Phase, diagnose};
pub use ledger_error::LedgerError;
