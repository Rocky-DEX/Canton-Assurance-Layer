//! Generated Canton Ledger API v2 message types.
//!
//! Module layout mirrors the protobuf packages so prost's `super::` references
//! resolve:
//! - [`com::daml::ledger::api::v2`] — commands, values, events, transactions
//! - [`com::daml::ledger::api::v2::interactive`] — prepare/execute submission
//! - [`com::daml::ledger::api::v2::interactive::transaction::v1`] — Daml transaction nodes
//!
//! Short aliases: [`v2`], [`interactive`], [`interactive_tx_v1`].

#![allow(clippy::all, rustdoc::all)]

pub mod google {
    pub mod protobuf {
        include!(concat!(env!("OUT_DIR"), "/google.protobuf.rs"));
    }
    pub mod rpc {
        include!(concat!(env!("OUT_DIR"), "/google.rpc.rs"));
    }
}

pub mod com {
    pub mod daml {
        pub mod ledger {
            pub mod api {
                pub mod v2 {
                    include!(concat!(env!("OUT_DIR"), "/com.daml.ledger.api.v2.rs"));
                    pub mod interactive {
                        include!(concat!(
                            env!("OUT_DIR"),
                            "/com.daml.ledger.api.v2.interactive.rs"
                        ));
                        pub mod transaction {
                            pub mod v1 {
                                include!(concat!(
                                    env!("OUT_DIR"),
                                    "/com.daml.ledger.api.v2.interactive.transaction.v1.rs"
                                ));
                            }
                        }
                    }
                }
            }
        }
    }
}

pub use com::daml::ledger::api::v2;
pub use com::daml::ledger::api::v2::interactive;
pub use com::daml::ledger::api::v2::interactive::transaction::v1 as interactive_tx_v1;
pub use prost;
pub use prost_types;
