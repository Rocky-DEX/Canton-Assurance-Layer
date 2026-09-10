//! canton-sim core: pre-submit simulation for Canton transactions.
//!
//! Pipeline (see [`simulate::Simulator`]):
//!
//! ```text
//! SimulationRequest ──▶ /v2/interactive-submission/prepare ──┬─▶ Ok  ──▶ decode PreparedTransaction ──▶ Effects + TrafficQuote
//!                                                            └─▶ Err ──▶ LedgerError ──▶ Diagnosis (+ contract-state lookup)
//! ```
//!
//! `prepare` runs full Daml interpretation on the participant without
//! sequencing anything, so a successful prepare means "this exact command
//! would be accepted by interpretation and authorization right now", and a
//! rejection carries the same error the real submission would have produced.
//! Confirmation-time failures (contention, vetting on other participants) are
//! not covered by prepare; the report says so explicitly.

pub mod ledger;
pub mod model;
pub mod prepared;
pub mod render;
pub mod scan;
pub mod simulate;

pub use canton_sim_diagnose as diagnose;
pub use canton_sim_fee as fee;
pub use ledger::{JsonLedgerClient, LedgerApi, LedgerApiError, TokenSource};
pub use model::*;
pub use simulate::Simulator;
