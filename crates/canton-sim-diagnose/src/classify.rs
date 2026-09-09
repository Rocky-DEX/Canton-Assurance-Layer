//! Classification of a [`LedgerError`] into a [`Diagnosis`].
//!
//! The goal is the answer a developer wants when a submission is rejected:
//! *which phase failed, why in one sentence, which template/choice/contract/
//! party is involved, and what to do next*. Canton's own explanation and
//! resolution text is attached from the catalog; the hints are canton-sim's
//! own, targeted at the concrete cause text.

use crate::catalog::{self, CatalogEntry};
use crate::ledger_error::LedgerError;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Where in the submission pipeline the failure happened.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    /// Token missing/invalid or insufficient rights for actAs/readAs.
    Auth,
    /// Request shape: fields, template ids, package resolution, dedup period.
    Request,
    /// Daml interpretation: assertions, preconditions, exceptions, missing contracts.
    Interpretation,
    /// Daml authorization: signatories/controllers not among actAs.
    Authorization,
    /// Synchronizer routing: vetting, hosting, connectivity.
    Routing,
    /// Sequencer: traffic credit, backpressure, duplicates, timeouts.
    Sequencing,
    /// Confirmation by other participants (local verdicts, model conformance).
    Confirmation,
    /// Participant-side infrastructure: overload, shutdown, internal errors.
    Participant,
    Unknown,
}

impl Phase {
    pub fn label(self) -> &'static str {
        match self {
            Phase::Auth => "authentication / permissions",
            Phase::Request => "request validation",
            Phase::Interpretation => "Daml interpretation",
            Phase::Authorization => "Daml authorization",
            Phase::Routing => "synchronizer routing",
            Phase::Sequencing => "sequencing",
            Phase::Confirmation => "confirmation",
            Phase::Participant => "participant infrastructure",
            Phase::Unknown => "unknown",
        }
    }
}

/// Facts pulled out of the cause text / context.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Extracted {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub choice: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub contract_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub parties: Vec<String>,
    /// Parties Daml says must authorize the node.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub required_authorizers: Vec<String>,
    /// Parties that actually authorized (actAs at that node).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub given_authorizers: Vec<String>,
    /// Required minus given.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub missing_authorizers: Vec<String>,
    /// Daml exception type, e.g. `DA.Exception.AssertionFailed:AssertionFailed`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exception_type: Option<String>,
    /// Message of an assertion / exception / failWithStatus.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// `errorId` of a `failWithStatus` failure.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synchronizer_id: Option<String>,
}

/// The structured explanation of a rejection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Diagnosis {
    pub code: String,
    pub phase: Phase,
    /// Canton category name when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// One-line, developer-facing title.
    pub title: String,
    /// One-paragraph summary specialised to the cause text.
    pub summary: String,
    /// Canton's catalog explanation (if the code is known).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    /// Canton's catalog resolution (if the code is known).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolution: Option<String>,
    /// Concrete next steps.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hints: Vec<String>,
    pub extracted: Extracted,
    /// Whether retrying the same submission unchanged can succeed.
    pub retryable: bool,
    /// Whether the participant declared the answer definite.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub definite_answer: Option<bool>,
    /// Provenance of the catalog entry, when any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalog_source: Option<String>,
    /// The parsed error this diagnosis was derived from.
    pub error: LedgerError,
}

/// Produce a [`Diagnosis`] for a parsed error.
pub fn diagnose(error: &LedgerError) -> Diagnosis {
    let entry = catalog::lookup(&error.code);
    let phase = phase_for(&error.code);
    let extracted = extract(error);
    let (title, summary, mut hints) = specialise(error, phase, &extracted);
    hints.extend(generic_hints(error, phase));
    dedup(&mut hints);
    let category = error
        .error_category
        .map(catalog::category_name)
        .map(str::to_string)
        .or_else(|| entry.map(|e| e.category.clone()));
    let retryable = error
        .error_category
        .map(catalog::category_is_retryable)
        .unwrap_or_else(|| retryable_by_code(&error.code))
        && error.definite_answer != Some(true);
    Diagnosis {
        code: error.code.clone(),
        phase,
        category,
        title,
        summary,
        explanation: entry.map(|e: &CatalogEntry| e.explanation.clone()),
        resolution: entry.map(|e| e.resolution.clone()),
        hints,
        extracted,
        retryable,
        definite_answer: error.definite_answer,
        catalog_source: entry.map(|e| e.source.clone()),
        error: error.clone(),
    }
}

fn phase_for(code: &str) -> Phase {
    let c = code.to_ascii_uppercase();
    match c.as_str() {
        "PERMISSION_DENIED" | "UNAUTHENTICATED" | "STALE_STREAM_AUTHORIZATION" => Phase::Auth,
        "DAML_AUTHORIZATION_ERROR" => Phase::Authorization,
        "INVALID_ARGUMENT"
        | "INVALID_FIELD"
        | "MISSING_FIELD"
        | "COMMAND_PREPROCESSING_FAILED"
        | "DAML_INTERPRETER_INVALID_ARGUMENT"
        | "TEMPLATES_OR_INTERFACES_NOT_FOUND"
        | "PACKAGE_NOT_FOUND"
        | "PACKAGE_NAMES_NOT_FOUND"
        | "NO_TEMPLATES_FOR_PACKAGE_NAME_AND_QUALIFIED_NAME"
        | "NO_INTERFACE_FOR_PACKAGE_NAME_AND_QUALIFIED_NAME"
        | "INVALID_DEDUPLICATION_PERIOD"
        | "DISCLOSED_CONTRACT_KEY_HASHING_ERROR"
        | "UNRESOLVED_PACKAGE_NAME"
        | "PACKAGE_SELECTION_FAILED"
        | "NO_PREFERRED_PACKAGES_FOUND"
        | "ALLOWED_LANGUAGE_VERSIONS"
        | "VALUE_NESTING"
        | "MALFORMED_TEXT"
        | "UNSUPPORTED_OPERATION"
        | "PACKAGE_VALIDATION_FAILED"
        | "USER_NOT_FOUND"
        | "PARTY_NOT_FOUND"
        | "PARTY_NOT_KNOWN_ON_LEDGER" => Phase::Request,
        "NO_SYNCHRONIZER_FOR_SUBMISSION"
        | "NOT_CONNECTED_TO_ANY_SYNCHRONIZER"
        | "NOT_CONNECTED_TO_SYNCHRONIZER"
        | "UNKNOWN_SUBMITTERS"
        | "UNKNOWN_INFORMEES"
        | "SUBMITTERS_NOT_ACTIVE"
        | "INVALID_PRESCRIBED_SYNCHRONIZER_ID"
        | "PRESCRIBED_SYNCHRONIZER_ID_MISMATCH"
        | "DISCLOSED_CONTRACTS_SYNCHRONIZER_ID_MISMATCH"
        | "UNKNOWN_CONTRACT_SYNCHRONIZER"
        | "PACKAGE_NOT_VETTED_BY_RECIPIENTS"
        | "PACKAGE_NAME_DISCARDED_DUE_TO_UNVETTED_PACKAGES"
        | "NO_VIEW_WITH_VALID_RECIPIENTS"
        | "SYNCHRONIZER_WITHOUT_MEDIATOR"
        | "CHOSEN_MEDIATOR_IS_INACTIVE"
        | "NO_VETTED_INTERFACE_IMPLEMENTATION_PACKAGE" => Phase::Routing,
        "SUBMISSION_ALREADY_IN_FLIGHT"
        | "DUPLICATE_COMMAND"
        | "REQUEST_ALREADY_IN_FLIGHT"
        | "NOT_SEQUENCED_TIMEOUT"
        | "OUTDATED_TRAFFIC_COST"
        | "SEQUENCER_REQUEST_FAILED" => Phase::Sequencing,
        "INCONSISTENT"
        | "MALFORMED_REQUEST"
        | "INVALID_EXTERNAL_SIGNATURE"
        | "INVALID_EXTERNAL_TRANSACTION"
        | "FAILED_TO_EXECUTE_TRANSACTION" => Phase::Confirmation,
        "PARTICIPANT_BACKPRESSURE"
        | "PARTICIPANT_OVERLOADED"
        | "SERVICE_NOT_RUNNING"
        | "REQUEST_TIME_OUT"
        | "REQUEST_DEADLINE_EXCEEDED"
        | "SERVER_IS_SHUTTING_DOWN"
        | "SUBMISSION_DURING_SHUTDOWN"
        | "NODE_IS_PASSIVE_REPLICA"
        | "SYNC_SERVICE_PASSIVE_REPLICA"
        | "LEDGER_API_INTERNAL_ERROR"
        | "SERVICE_INTERNAL_ERROR"
        | "THREADPOOL_OVERLOADED"
        | "HEAP_MEMORY_OVER_LIMIT"
        | "MAXIMUM_NUMBER_OF_STREAMS"
        | "FAILED_TO_PREPARE_TRANSACTION"
        | "COMMAND_INJECTION_FAILURE" => Phase::Participant,
        _ if c.starts_with("SEQUENCER_") => Phase::Sequencing,
        _ if c.starts_with("LOCAL_VERDICT_") => Phase::Confirmation,
        _ if c.starts_with("INDEX_DB_") => Phase::Participant,
        _ if c.starts_with("INTERPRETATION_")
            || c.starts_with("DAML_")
            || c.starts_with("CONTRACT_")
            || c.ends_with("_CONTRACT_KEY")
            || c.ends_with("_CONTRACT_KEY_MAINTAINERS")
            || matches!(
                c.as_str(),
                "UNHANDLED_EXCEPTION"
                    | "TEMPLATE_PRECONDITION_VIOLATED"
                    | "NON_COMPARABLE_VALUES"
                    | "WRONGLY_TYPED_CONTRACT"
                    | "FAILED_TO_DETERMINE_LEDGER_TIME"
                    | "LEDGER_TIME_OUTSIDE_BOUNDS"
            ) =>
        {
            Phase::Interpretation
        }
        _ if c.starts_with("TOPOLOGY_") => Phase::Routing,
        _ => Phase::Unknown,
    }
}

fn retryable_by_code(code: &str) -> bool {
    matches!(
        code,
        "PARTICIPANT_BACKPRESSURE"
            | "PARTICIPANT_OVERLOADED"
            | "SEQUENCER_BACKPRESSURE"
            | "SEQUENCER_OVERLOADED"
            | "REQUEST_TIME_OUT"
            | "NOT_SEQUENCED_TIMEOUT"
            | "SUBMISSION_ALREADY_IN_FLIGHT"
            | "LOCAL_VERDICT_LOCKED_CONTRACTS"
            | "LOCAL_VERDICT_TIMEOUT"
            | "OUTDATED_TRAFFIC_COST"
            | "SERVICE_NOT_RUNNING"
            | "THREADPOOL_OVERLOADED"
    )
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

static RE_TEMPLATE: Lazy<Regex> = Lazy::new(|| {
    // pkgid:Module.Path:Entity  or  #pkg-name:Module:Entity
    Regex::new(r"(?:#[A-Za-z0-9_.\-]+|[0-9a-f]{64}):[A-Za-z0-9_.]+:[A-Za-z0-9_]+").expect("regex")
});
static RE_CONTRACT_ID: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b00[0-9a-f]{40,}\b").expect("regex"));
static RE_PARTY: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[A-Za-z0-9_\-.]+::[0-9a-f]{20,}\b").expect("regex"));
static RE_AUTHORIZERS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"requires authorizers (.+?), but only (.+?) were given").expect("regex")
});
static RE_MISSING_AUTH: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"missing authorization from '([^']+)'").expect("regex"));
static RE_EXCEPTION: Lazy<Regex> = Lazy::new(|| {
    // Unhandled Daml exception: DA.Exception.AssertionFailed:AssertionFailed@hash{ message = "..." }
    Regex::new(
        r#"Unhandled (?:Daml )?exception:\s*([A-Za-z0-9_.]+:[A-Za-z0-9_]+)(?:@[0-9a-f]+)?\s*\{(.*?)\}"#,
    )
    .expect("regex")
});
static RE_MESSAGE_FIELD: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"message\s*=\s*"((?:[^"\\]|\\.)*)""#).expect("regex"));
static RE_ERROR_ID: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"errorId\s*[=:]\s*"?([A-Za-z0-9_.:\-]+)"?"#).expect("regex"));
static RE_PRECONDITION_TEMPLATE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"Template precondition violated:\s*Template:\s*(\S+)").expect("regex")
});
static RE_CHOICE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?:exercise of|choice)\s+([A-Z][A-Za-z0-9_]*)\b").expect("regex"));
static RE_SYNC_ID: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[a-z0-9\-]+::[0-9a-f]{20,}\b").expect("regex"));

fn split_parties(s: &str) -> Vec<String> {
    s.split(|c: char| c == ',' || c.is_whitespace())
        .map(|p| p.trim_matches(|c: char| c == '[' || c == ']' || c == '\'' || c == '"'))
        .filter(|p| !p.is_empty())
        .map(str::to_string)
        .collect()
}

#[allow(clippy::field_reassign_with_default)]
fn extract(error: &LedgerError) -> Extracted {
    let cause = error.cause.as_str();
    let mut x = Extracted::default();

    x.template_id = RE_PRECONDITION_TEMPLATE
        .captures(cause)
        .map(|c| c[1].trim_end_matches(',').to_string())
        .or_else(|| RE_TEMPLATE.find(cause).map(|m| m.as_str().to_string()));
    if let Some(cid) = error.resource("CONTRACT_ID") {
        x.contract_ids.push(cid.to_string());
    }
    for m in RE_CONTRACT_ID.find_iter(cause) {
        let s = m.as_str().to_string();
        if !x.contract_ids.contains(&s) {
            x.contract_ids.push(s);
        }
    }
    let mut parties: BTreeSet<String> = RE_PARTY
        .find_iter(cause)
        .map(|m| m.as_str().to_string())
        .collect();
    if let Some(c) = RE_AUTHORIZERS.captures(cause) {
        x.required_authorizers = split_parties(&c[1]);
        x.given_authorizers = split_parties(&c[2]);
        x.missing_authorizers = x
            .required_authorizers
            .iter()
            .filter(|p| !x.given_authorizers.contains(p))
            .cloned()
            .collect();
        parties.extend(x.required_authorizers.iter().cloned());
        parties.extend(x.given_authorizers.iter().cloned());
    } else if let Some(c) = RE_MISSING_AUTH.captures(cause) {
        x.missing_authorizers = split_parties(&c[1]);
        x.required_authorizers = x.missing_authorizers.clone();
        parties.extend(x.missing_authorizers.iter().cloned());
    }
    x.parties = parties.into_iter().collect();
    if let Some(c) = RE_EXCEPTION.captures(cause) {
        x.exception_type = Some(c[1].to_string());
        x.message = RE_MESSAGE_FIELD.captures(&c[2]).map(|m| unescape(&m[1]));
    }
    if x.message.is_none() {
        x.message = RE_MESSAGE_FIELD.captures(cause).map(|m| unescape(&m[1]));
    }
    x.error_id = RE_ERROR_ID.captures(cause).map(|c| c[1].to_string());
    x.choice = RE_CHOICE.captures(cause).map(|c| c[1].to_string());
    if let Some(t) = &x.template_id
        && let Some((pkg, _)) = t.split_once(':')
        && !pkg.starts_with('#')
    {
        x.package_id = Some(pkg.to_string());
    }
    x.synchronizer_id = error
        .context
        .get("synchronizer_id")
        .or_else(|| error.context.get("synchronizerId"))
        .cloned()
        .or_else(|| {
            RE_SYNC_ID
                .find_iter(cause)
                .map(|m| m.as_str().to_string())
                .find(|s| !x.parties.contains(s))
        });
    x
}

fn unescape(s: &str) -> String {
    s.replace("\\\"", "\"").replace("\\n", "\n")
}

// ---------------------------------------------------------------------------
// Specialisation per code
// ---------------------------------------------------------------------------

fn specialise(error: &LedgerError, phase: Phase, x: &Extracted) -> (String, String, Vec<String>) {
    let code = error.code.as_str();
    let cause = error.cause.as_str();
    let lc = cause.to_ascii_lowercase();
    let tpl = x
        .template_id
        .clone()
        .unwrap_or_else(|| "the template".into());
    match code {
        "UNHANDLED_EXCEPTION" => {
            let ty = x.exception_type.clone().unwrap_or_else(|| "exception".into());
            let msg = x.message.clone().unwrap_or_default();
            let short = ty.rsplit(':').next().unwrap_or(&ty).to_string();
            let title = if msg.is_empty() {
                format!("Daml threw {short} during interpretation")
            } else {
                format!("Daml {short}: \"{msg}\"")
            };
            let summary = match short.as_str() {
                "AssertionFailed" => format!(
                    "An `assert`/`assertMsg` in the choice body evaluated to False{}. The transaction would be rejected before reaching the sequencer; nothing is charged.",
                    if msg.is_empty() { String::new() } else { format!(" with message \"{msg}\"") }
                ),
                "PreconditionFailed" => "A template `ensure` clause or a `create` precondition failed for a contract this transaction would create.".to_string(),
                "ArithmeticError" => "A Decimal/Int arithmetic operation overflowed, divided by zero, or lost precision (e.g. a Numeric scale mismatch).".to_string(),
                "GeneralError" => format!("Daml code called `error`/`abort`{}.", if msg.is_empty() { String::new() } else { format!(": \"{msg}\"") }),
                _ => format!("Daml raised the user-defined exception `{ty}` and no `try … catch` handled it."),
            };
            let mut hints = vec![
                "Read the assertion message: it names the business rule that rejected the input (e.g. insufficient balance, wrong side, stale version).".to_string(),
                "Compare the choice arguments against the *current* contract payload — fetch it with `canton-sim contract <cid>` (which calls `/v2/events/events-by-contract-id`) — the contract may have changed since you read it.".to_string(),
            ];
            if short == "ArithmeticError" {
                hints.push("Check Numeric scales: Decimal is Numeric 10; passing more than 10 fractional digits or exceeding 38 digits fails at interpretation.".to_string());
            }
            (title, summary, hints)
        }
        "DAML_FAILURE" => {
            let msg = x.message.clone().unwrap_or_default();
            let id = x.error_id.clone().unwrap_or_else(|| "unspecified".into());
            (
                format!("Daml failWithStatus [{id}]{}", if msg.is_empty() { String::new() } else { format!(": \"{msg}\"") }),
                "The choice deliberately failed with `failWithStatus`; the error id and category are chosen by the template author. This is a business-rule rejection, not an infrastructure problem.".to_string(),
                vec![
                    "Look up the errorId in the Daml package documentation; the meta map (if present) carries structured details of the rejection.".to_string(),
                ],
            )
        }
        "TEMPLATE_PRECONDITION_VIOLATED" => (
            format!("`ensure` clause of {tpl} rejected the create"),
            format!("The transaction tries to create a {tpl} contract whose payload violates its `ensure` predicate (e.g. a negative balance or an invalid version)."),
            vec![
                "Check the template's `ensure` line; every field in the create arguments (including ones set by a choice body) must satisfy it.".to_string(),
                "When the create happens inside a choice (Credit/Debit patterns), the violating value is usually derived from the *existing* contract plus your delta.".to_string(),
            ],
        ),
        "DAML_AUTHORIZATION_ERROR" => {
            let missing = x.missing_authorizers.join(", ");
            let title = if missing.is_empty() {
                "Missing Daml authorization".to_string()
            } else {
                format!("Missing authorization from {missing}")
            };
            let summary = if x.required_authorizers.is_empty() {
                "A create or exercise in this transaction needs a signatory/controller that is not among the parties acting (actAs) or delegating authority via an enclosing choice.".to_string()
            } else {
                format!(
                    "The node requires authorizers [{}] but only [{}] authorized it. Parties must be in `actAs` or gain authority through a choice controlled by an actAs party.",
                    x.required_authorizers.join(", "),
                    x.given_authorizers.join(", ")
                )
            };
            (
                title,
                summary,
                vec![
                    "Add the missing party to `actAs` only if your token has actAs rights for it; otherwise the workflow needs a propose/accept pattern or a choice the missing party controls.".to_string(),
                    "Check whether the choice's `controller` is the party you expect: e.g. an exchange-controlled choice cannot be exercised by the user party.".to_string(),
                    "For multi-party creates, all signatories must authorize; use `CreateAndExercise` on a request/proposal contract instead of a direct create.".to_string(),
                ],
            )
        }
        "CONTRACT_NOT_FOUND" => {
            let cid = x.contract_ids.first().cloned().unwrap_or_default();
            (
                format!("Contract {} not found", short_cid(&cid)),
                "The referenced contract id is unknown to this participant, already archived, or not visible to the acting/reading parties (a stakeholder must be in actAs/readAs).".to_string(),
                vec![
                    "canton-sim checks `/v2/events/events-by-contract-id` to tell *archived* from *never seen* — see the `contract_state` section of the report.".to_string(),
                    "If it was archived, re-query the active contract set for the successor (version+1 patterns create a new cid on every mutation).".to_string(),
                    "If it is unknown, the contract may live on a participant you are not hosted on: pass it as a `disclosedContract` (explicit disclosure) or add a stakeholder to `readAs`.".to_string(),
                ],
            )
        }
        "CONTRACT_NOT_ACTIVE" => (
            "Contract consumed earlier in the same transaction".to_string(),
            "The command exercises or fetches a contract that a previous node in this very transaction already archived (double-spend within one submission).".to_string(),
            vec!["Reorder the commands or use the contract id returned by the consuming choice instead of the input cid.".to_string()],
        ),
        "LOCAL_VERDICT_INACTIVE_CONTRACTS" => (
            "Input contract no longer active at confirmation time".to_string(),
            "Interpretation succeeded but by the time the confirmation request reached the participant, an input contract had been archived or reassigned (contention with a concurrent transaction).".to_string(),
            vec!["Re-read the active contracts and resubmit; if this recurs, serialise writers on the contract or use a version/nonce pattern.".to_string()],
        ),
        "LOCAL_VERDICT_LOCKED_CONTRACTS" => (
            "Input contract locked by an in-flight transaction".to_string(),
            "Another transaction touching the same contract is pending confirmation; Canton rejects the later one instead of queueing it.".to_string(),
            vec!["Retry after the in-flight transaction completes (typically < confirmation timeout); back off with jitter.".to_string()],
        ),
        "CONTRACT_KEY_NOT_FOUND" => (
            "Contract key lookup failed".to_string(),
            "`fetchByKey`/`exerciseByKey` found no active contract for the key visible to the acting parties.".to_string(),
            vec!["Keys are only visible to maintainers; ensure a maintainer is in actAs/readAs, and that the key value (all fields, including party ids) matches exactly.".to_string()],
        ),
        "DAML_INTERPRETER_INVALID_ARGUMENT" | "COMMAND_PREPROCESSING_FAILED" => {
            let mut hints = vec![
                "Compare the JSON argument against the template's field names and types (Daml JSON encoding: Decimal as string, Time as ISO-8601, Party as party id, records as objects, variants as {\"tag\":…,\"value\":…}).".to_string(),
            ];
            if lc.contains("unknown template") || lc.contains("template") && lc.contains("not found") {
                hints.insert(0, "The template id could not be resolved: use `#package-name:Module:Entity` (package-name reference) or the full `pkgid:Module:Entity`, and make sure the DAR is uploaded to this participant.".to_string());
            }
            if lc.contains("missing") || lc.contains("field") {
                hints.insert(0, "A record field is missing or misspelled; field names are case-sensitive and optional fields must still be present as null.".to_string());
            }
            (
                "Command arguments do not type-check".to_string(),
                format!("The participant could not translate the command into a valid Daml value: {}", first_sentence(cause)),
                hints,
            )
        }
        "INVALID_ARGUMENT" | "INVALID_FIELD" | "MISSING_FIELD" => {
            let mut hints = Vec::new();
            if lc.contains("single command") {
                hints.push("The interactive-submission prepare endpoint currently accepts exactly one command per request: bundle multi-step logic behind a single `CreateAndExerciseCommand` or a helper choice.".to_string());
            }
            if lc.contains("commandid") || lc.contains("command_id") {
                hints.push("`commandId` must be a non-empty LedgerString (letters, digits, `-_:.#/`).".to_string());
            }
            if lc.contains("actas") || lc.contains("act_as") {
                hints.push("`actAs` must contain at least one party id.".to_string());
            }
            hints.push("Validate the request against the JSON Ledger API OpenAPI spec (`/v2/interactive-submission/prepare`).".to_string());
            (
                "Request rejected before interpretation".to_string(),
                format!("The request itself is malformed: {}", first_sentence(cause)),
                hints,
            )
        }
        "PERMISSION_DENIED" => (
            "Token lacks rights for the requested parties".to_string(),
            "The Ledger API user behind the token cannot act/read as one of the parties, or the operation needs admin rights. For `prepare`, *read* rights on each actAs party suffice.".to_string(),
            vec![
                "Inspect the user's rights with `GET /v2/users/{user-id}/rights` and compare with actAs/readAs.".to_string(),
                "A 403 with 'security-sensitive error' hides details on purpose: check the participant log with the correlationId.".to_string(),
            ],
        ),
        "UNAUTHENTICATED" => (
            "Missing or invalid bearer token".to_string(),
            "The request carried no JWT, or the JWT failed validation (expired, wrong audience/scope, unknown issuer key).".to_string(),
            vec!["Fetch a fresh token from the participant's identity provider and confirm its `aud`/`scope` matches the participant's ledger-api auth config.".to_string()],
        ),
        "NO_SYNCHRONIZER_FOR_SUBMISSION" => {
            let mut hints = vec![
                "Read the per-synchronizer reasons in the error context; each connected synchronizer is listed with why it was rejected.".to_string(),
            ];
            if lc.contains("vet") {
                hints.push("A package is not vetted on a participant hosting one of the informees: upload the DAR there and vet it (`/v2/package-vetting`).".to_string());
            }
            if lc.contains("host") || lc.contains("informee") || lc.contains("unknown") {
                hints.push("An informee (signatory/observer/controller) is not hosted on any participant connected to a common synchronizer; check party-to-participant topology.".to_string());
            }
            (
                "No synchronizer can carry this transaction".to_string(),
                "Routing failed: the participant found no synchronizer where all informees are hosted and all packages are vetted.".to_string(),
                hints,
            )
        }
        "PACKAGE_NOT_VETTED_BY_RECIPIENTS" => (
            format!("Package {} not vetted by a recipient participant", x.package_id.clone().unwrap_or_else(|| "(see cause)".into())),
            "A participant hosting one of the informees has not vetted the Daml package used by a view. Such transactions are rejected at confirmation on that participant.".to_string(),
            vec!["Ask the counterparty's participant operator to upload and vet the package; the package id in the cause identifies it. Vetting is per synchronizer.".to_string()],
        ),
        "SEQUENCER_NOT_ENOUGH_TRAFFIC_CREDIT" => (
            "Insufficient traffic credit on the synchronizer".to_string(),
            "The sequencer refused the confirmation request because the participant's traffic balance is below the cost of the message. The command was not sequenced and no fee was charged.".to_string(),
            vec![
                "Top up traffic (buy extra traffic with Canton Coin via the validator's wallet / `/api/validator/v0/wallet/…top-up`) or wait for the base-rate allowance to refill.".to_string(),
                "The `traffic` section of the canton-sim report shows the estimated cost of this transaction so you can size the top-up.".to_string(),
            ],
        ),
        "SEQUENCER_BACKPRESSURE" | "PARTICIPANT_BACKPRESSURE" | "PARTICIPANT_OVERLOADED" | "SEQUENCER_OVERLOADED" => (
            "Node overloaded — retry with backoff".to_string(),
            "The sequencer or participant is shedding load; the submission was not processed.".to_string(),
            vec!["Retry with exponential backoff and the *same* commandId + deduplication period so a late acceptance is not duplicated.".to_string()],
        ),
        "SUBMISSION_ALREADY_IN_FLIGHT" => (
            "Same change id already in flight".to_string(),
            "A submission with this (userId, commandId, actAs) is still being processed; Canton deduplicates it.".to_string(),
            vec!["Wait for the completion of the earlier submission (`/v2/commands/completions`) instead of resubmitting.".to_string()],
        ),
        "DUPLICATE_COMMAND" => (
            "Command already accepted (deduplication)".to_string(),
            "A command with the same change id succeeded within the deduplication period. This is a *success* from the ledger's point of view.".to_string(),
            vec!["If the intent is a new change, use a fresh commandId; if it was a retry, nothing to do.".to_string()],
        ),
        "INVALID_DEDUPLICATION_PERIOD" => (
            "Deduplication period out of range".to_string(),
            "The requested deduplication duration/offset exceeds what the participant supports.".to_string(),
            vec!["The context usually carries `max_deduplication_duration`; shorten the period accordingly.".to_string()],
        ),
        "NOT_CONNECTED_TO_ANY_SYNCHRONIZER" | "NOT_CONNECTED_TO_SYNCHRONIZER" => (
            "Participant not connected to a synchronizer".to_string(),
            "The participant is not connected to the (or any) synchronizer, so nothing can be routed.".to_string(),
            vec!["Check `/v2/state/connected-synchronizers`; the validator may be restarting or disconnected from the Global Synchronizer.".to_string()],
        ),
        "LEDGER_TIME_OUTSIDE_BOUNDS" | "FAILED_TO_DETERMINE_LEDGER_TIME" | "LOCAL_VERDICT_LEDGER_TIME_OUT_OF_BOUND" => (
            "Ledger time constraint cannot be satisfied".to_string(),
            "The Daml code depends on `getTime` (e.g. deadlines) in a way that no ledger-effective time in the allowed window satisfies.".to_string(),
            vec!["Widen the time window in the template or supply `minLedgerTime`; prepared transactions are only valid for a limited record-time window.".to_string()],
        ),
        _ if phase == Phase::Unknown && code == "UNKNOWN" => (
            "Unrecognised error".to_string(),
            format!("No Canton error code could be extracted from: {}", first_sentence(cause)),
            vec!["Paste the full JSON error body (it starts with {\"code\":…) for a precise diagnosis.".to_string()],
        ),
        _ => {
            let entry = catalog::lookup(code);
            let title = entry
                .map(|_| humanize(code))
                .unwrap_or_else(|| format!("{code} (not in catalog)"));
            let summary = first_sentence(cause);
            let summary = if summary.is_empty() {
                entry.map(|e| e.explanation.clone()).unwrap_or_default()
            } else {
                summary
            };
            (title, summary, Vec::new())
        }
    }
}

fn generic_hints(error: &LedgerError, phase: Phase) -> Vec<String> {
    let mut hints = Vec::new();
    match phase {
        Phase::Interpretation | Phase::Authorization | Phase::Request => {
            hints.push("This failure happens on the preparing participant: nothing was sent to the synchronizer and no traffic was consumed.".to_string());
        }
        Phase::Confirmation | Phase::Sequencing => {
            hints.push("This failure happens after submission: traffic for the confirmation request is consumed even though the transaction is rejected.".to_string());
        }
        _ => {}
    }
    if let Some(cid) = &error.correlation_id {
        hints.push(format!(
            "Correlate with participant logs using correlationId {cid}."
        ));
    }
    hints
}

fn dedup(hints: &mut Vec<String>) {
    let mut seen = BTreeSet::new();
    hints.retain(|h| seen.insert(h.clone()));
}

fn first_sentence(s: &str) -> String {
    let s = s.trim();
    let cut = s.find(". ").map(|i| i + 1).unwrap_or(s.len()).min(240);
    let mut out = s[..cut].trim().to_string();
    if cut < s.len() {
        out.push('…');
    }
    out
}

fn short_cid(cid: &str) -> String {
    if cid.len() > 18 {
        format!("{}…{}", &cid[..10], &cid[cid.len() - 6..])
    } else if cid.is_empty() {
        "(unknown id)".to_string()
    } else {
        cid.to_string()
    }
}

fn humanize(code: &str) -> String {
    let mut s = code.to_ascii_lowercase().replace('_', " ");
    if let Some(first) = s.get_mut(0..1) {
        first.make_ascii_uppercase();
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn err(code: &str, cause: &str) -> LedgerError {
        LedgerError {
            code: code.into(),
            cause: cause.into(),
            ..Default::default()
        }
    }

    #[test]
    fn assertion_failure_is_explained() {
        let e = err(
            "UNHANDLED_EXCEPTION",
            r#"Interpretation error: Error: Unhandled Daml exception: DA.Exception.AssertionFailed:AssertionFailed@3f4deaf145a15cdcfa762c2ed1dd0d92c0d8a6b6ba79c8e7d6c0a6f4e5f3a3a1{ message = "Insufficient balance" }."#,
        );
        let d = diagnose(&e);
        assert_eq!(d.phase, Phase::Interpretation);
        assert_eq!(d.extracted.message.as_deref(), Some("Insufficient balance"));
        assert!(d.title.contains("AssertionFailed"), "{}", d.title);
        assert!(d.title.contains("Insufficient balance"));
        assert!(!d.retryable);
        assert!(d.explanation.is_some());
    }

    #[test]
    fn authorization_error_extracts_missing_parties() {
        let e = err(
            "DAML_AUTHORIZATION_ERROR",
            "Interpretation error: Error: node NodeId(0) (a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4:PerpCustody:PlatformAccount) requires authorizers exchange::1220aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, but only operator::1220bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb were given",
        );
        let d = diagnose(&e);
        assert_eq!(d.phase, Phase::Authorization);
        assert_eq!(
            d.extracted.missing_authorizers,
            vec!["exchange::1220aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string()]
        );
        assert_eq!(
            d.extracted.template_id.as_deref(),
            Some(
                "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4:PerpCustody:PlatformAccount"
            )
        );
        assert!(d.title.contains("exchange::1220"));
    }

    #[test]
    fn precondition_violation_names_template() {
        let e = err(
            "TEMPLATE_PRECONDITION_VIOLATED",
            "Interpretation error: Error: Template precondition violated: Template: #perp-custody:PerpCustody:PlatformAccount, arg: …",
        );
        let d = diagnose(&e);
        assert_eq!(
            d.extracted.template_id.as_deref(),
            Some("#perp-custody:PerpCustody:PlatformAccount")
        );
        assert!(d.title.contains("ensure"));
    }

    #[test]
    fn contract_not_found_uses_resource() {
        let body = r#"{"code":"CONTRACT_NOT_FOUND","cause":"Contract could not be found with id 00d3adbeef00d3adbeef00d3adbeef00d3adbeef00d3adbeef","context":{"category":"11"},"resources":[["CONTRACT_ID","00d3adbeef00d3adbeef00d3adbeef00d3adbeef00d3adbeef"]],"errorCategory":11}"#;
        let d = diagnose(&LedgerError::parse(Some(404), body));
        assert_eq!(d.phase, Phase::Interpretation);
        assert_eq!(d.extracted.contract_ids.len(), 1);
        assert_eq!(
            d.category.as_deref(),
            Some("InvalidGivenCurrentSystemStateResourceMissing")
        );
        assert!(!d.retryable);
    }

    #[test]
    fn transient_errors_are_retryable() {
        let body = r#"{"code":"SEQUENCER_BACKPRESSURE","cause":"The sequencer is overloaded.","context":{"category":"2","definite_answer":"true"}}"#;
        let d = diagnose(&LedgerError::parse(Some(409), body));
        assert_eq!(d.phase, Phase::Sequencing);
        // definite_answer=true means no retry can change it *for this submission*, but category 2 is contention.
        assert!(!d.retryable);
        let body = r#"{"code":"PARTICIPANT_BACKPRESSURE","cause":"overloaded","errorCategory":1}"#;
        assert!(diagnose(&LedgerError::parse(Some(503), body)).retryable);
    }

    #[test]
    fn single_command_limitation_hint() {
        let e = err(
            "INVALID_ARGUMENT",
            "The submitted request has invalid arguments: Only single command transaction are currently supported",
        );
        let d = diagnose(&e);
        assert!(d.hints.iter().any(|h| h.contains("exactly one command")));
    }

    #[test]
    fn daml_failure_extracts_error_id() {
        let e = err(
            "DAML_FAILURE",
            r#"Interpretation error: Error: Daml failure: FailureStatus(errorId = "Splice.Amulet:InsufficientFunds", category = 9, message = "not enough amulet", meta = Map())"#,
        );
        let d = diagnose(&e);
        assert_eq!(
            d.extracted.error_id.as_deref(),
            Some("Splice.Amulet:InsufficientFunds")
        );
        assert_eq!(d.extracted.message.as_deref(), Some("not enough amulet"));
    }

    #[test]
    fn unknown_code_still_produces_diagnosis() {
        let d = diagnose(&LedgerError::from_text("connection reset by peer"));
        assert_eq!(d.code, "UNKNOWN");
        assert_eq!(d.phase, Phase::Unknown);
        assert!(d.explanation.is_none());
    }
}
