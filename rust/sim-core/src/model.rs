//! Request and report models. These are the wire types of the CLI (`--json`)
//! and the HTTP server (`POST /v1/simulate`).

use canton_sim_diagnose::Diagnosis;
use canton_sim_fee::{AmuletFeeQuote, TrafficQuote};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// What to simulate. `commands` are JSON Ledger API `Command` objects
/// (`{"CreateCommand": {...}}`, `{"ExerciseCommand": {...}}`, …) exactly as
/// they would be sent to `/v2/commands/submit-and-wait`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SimulationRequest {
    /// Ledger API user id; may be omitted when the token carries a user id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Command id; generated when omitted. Never reused for a real submission
    /// by canton-sim itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command_id: Option<String>,
    pub act_as: Vec<String>,
    #[serde(default)]
    pub read_as: Vec<String>,
    pub commands: Vec<Value>,
    /// JSON Ledger API `DisclosedContract` objects.
    #[serde(default)]
    pub disclosed_contracts: Vec<Value>,
    /// Prescribed synchronizer; when empty the participant routes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synchronizer_id: Option<String>,
    #[serde(default)]
    pub package_id_selection_preference: Vec<String>,
    /// Relative minimum ledger time in seconds (`MinLedgerTimeRel`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_ledger_time_rel_secs: Option<u64>,
    /// Signature algorithm specs (`SIGNING_ALGORITHM_SPEC_ED25519`, …) used to
    /// size signatures in the traffic estimate; empty = participant default.
    #[serde(default)]
    pub expected_signatures: Vec<String>,
    /// Look up referenced contracts on failure to distinguish archived vs unknown.
    #[serde(default = "default_true")]
    pub lookup_contracts: bool,
    /// Include the decoded create/choice arguments in the effects.
    #[serde(default = "default_true")]
    pub include_arguments: bool,
    /// Include the raw base64 prepared transaction and hash in the report.
    #[serde(default)]
    pub include_prepared_transaction: bool,
}

fn default_true() -> bool {
    true
}

impl SimulationRequest {
    pub fn new(act_as: Vec<String>, commands: Vec<Value>) -> Self {
        Self {
            user_id: None,
            command_id: None,
            act_as,
            read_as: Vec::new(),
            commands,
            disclosed_contracts: Vec::new(),
            synchronizer_id: None,
            package_id_selection_preference: Vec::new(),
            min_ledger_time_rel_secs: None,
            expected_signatures: Vec::new(),
            lookup_contracts: true,
            include_arguments: true,
            include_prepared_transaction: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    /// Interpretation and authorization succeeded on the participant.
    WouldSucceed,
    /// The participant rejected the command; see `diagnosis`.
    WouldFail,
    /// canton-sim could not reach or understand the participant.
    Inconclusive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Create,
    Exercise,
    Fetch,
    Rollback,
}

/// One node of the prepared Daml transaction.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EffectNode {
    pub node_id: String,
    pub depth: usize,
    pub kind: NodeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interface_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contract_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub choice: Option<String>,
    /// For exercises: whether the input contract is archived.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consuming: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub acting_parties: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub signatories: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stakeholders: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub choice_observers: Vec<String>,
    /// Create arguments or choice argument, as Daml JSON.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub argument: Option<Value>,
    /// Exercise result, as Daml JSON.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<String>,
}

/// A contract the transaction reads or consumes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InputContract {
    pub contract_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub signatories: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stakeholders: Vec<String>,
    /// Whether a consuming exercise in this transaction archives it.
    pub consumed: bool,
}

/// Summary counters over the transaction.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct EffectCounts {
    pub creates: usize,
    pub archives: usize,
    pub exercises: usize,
    pub fetches: usize,
    pub rollbacks: usize,
}

/// The ledger effects of a prepared transaction — what *would* be committed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Effects {
    pub transaction_version: String,
    pub roots: Vec<String>,
    pub nodes: Vec<EffectNode>,
    pub counts: EffectCounts,
    /// Every party that will see at least one node.
    pub informees: Vec<String>,
    pub input_contracts: Vec<InputContract>,
    pub act_as: Vec<String>,
    pub command_id: String,
    pub synchronizer_id: String,
    pub mediator_group: u32,
    pub transaction_uuid: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preparation_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_ledger_effective_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_ledger_effective_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_record_time: Option<String>,
    /// Size of the serialized `PreparedTransaction` in bytes.
    pub prepared_size_bytes: usize,
    pub prepared_transaction_hash_hex: String,
    pub hashing_scheme_version: String,
}

/// Result of looking a contract up after a failure.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ContractState {
    Active {
        contract_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        template_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        created_at_offset: Option<i64>,
    },
    Archived {
        contract_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        template_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        created_at_offset: Option<i64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        archived_at_offset: Option<i64>,
    },
    /// The participant has never seen the contract for the requesting parties.
    Unknown { contract_id: String },
    /// Lookup itself failed (permissions, transport).
    LookupFailed { contract_id: String, error: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LedgerInfo {
    pub base_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub participant_version: Option<String>,
}

/// The full simulation report.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SimulationReport {
    pub outcome: Outcome,
    pub ledger: LedgerInfo,
    pub request: SimulationRequest,
    pub command_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effects: Option<Effects>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub traffic: Option<TrafficQuote>,
    /// Amulet fee quote when the command is recognised as a Canton Coin transfer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amulet_fee: Option<AmuletFeeQuote>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diagnosis: Option<Diagnosis>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub contract_states: Vec<ContractState>,
    /// Things prepare cannot tell you; always worth reading.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub caveats: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepared_transaction_base64: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepared_transaction_hash_base64: Option<String>,
    pub elapsed_ms: u128,
    pub simulated_at: String,
}
