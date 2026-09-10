//! The simulation orchestrator.

use crate::ledger::{LedgerApi, LedgerApiError};
use crate::model::*;
use crate::prepared;
use canton_sim_diagnose::{Diagnosis, LedgerError, Phase, diagnose};
use canton_sim_fee::{
    AmuletFeeQuote, FeeSchedule, TransferOutput, quote_amulet_transfer, quote_traffic,
};
use rust_decimal::Decimal;
use serde_json::{Value, json};
use std::str::FromStr;
use std::sync::Arc;
use std::time::Instant;

/// Runs simulations against one participant with one fee schedule.
#[derive(Clone)]
pub struct Simulator {
    client: Arc<dyn LedgerApi>,
    fee_schedule: FeeSchedule,
    /// Used when the request has no `user_id`; may be `None` when tokens
    /// carry the user id.
    default_user_id: Option<String>,
    /// Maximum number of contracts looked up to enrich a failure.
    max_contract_lookups: usize,
}

impl Simulator {
    pub fn new(client: Arc<dyn LedgerApi>, fee_schedule: FeeSchedule) -> Self {
        Self {
            client,
            fee_schedule,
            default_user_id: None,
            max_contract_lookups: 5,
        }
    }

    pub fn with_default_user_id(mut self, user_id: Option<String>) -> Self {
        self.default_user_id = user_id.filter(|u| !u.trim().is_empty());
        self
    }

    pub fn fee_schedule(&self) -> &FeeSchedule {
        &self.fee_schedule
    }

    /// Simulate one request. Never panics and never submits anything.
    pub async fn simulate(&self, request: SimulationRequest) -> SimulationReport {
        let started = Instant::now();
        let command_id = request
            .command_id
            .clone()
            .filter(|c| !c.trim().is_empty())
            .unwrap_or_else(|| format!("canton-sim-{}", uuid::Uuid::new_v4()));
        let body = self.build_prepare_body(&request, &command_id);

        let mut report = SimulationReport {
            outcome: Outcome::Inconclusive,
            ledger: LedgerInfo {
                base_url: self.client.base_url().to_string(),
                participant_version: None,
            },
            request: request.clone(),
            command_id: command_id.clone(),
            effects: None,
            traffic: None,
            amulet_fee: None,
            diagnosis: None,
            contract_states: Vec::new(),
            caveats: Vec::new(),
            prepared_transaction_base64: None,
            prepared_transaction_hash_base64: None,
            elapsed_ms: 0,
            simulated_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        };

        match self.client.prepare(&body).await {
            Ok(resp) => self.on_prepared(&request, resp, &mut report),
            Err(LedgerApiError::Rejected(err)) => {
                self.on_rejected(&request, *err, &mut report).await
            }
            Err(other) => {
                report.outcome = Outcome::Inconclusive;
                report
                    .caveats
                    .push(format!("could not run the simulation: {other}"));
            }
        }

        report.elapsed_ms = started.elapsed().as_millis();
        report
    }

    /// Build the `JsPrepareSubmissionRequest` body.
    pub fn build_prepare_body(&self, req: &SimulationRequest, command_id: &str) -> Value {
        let mut body = json!({
            "commandId": command_id,
            "commands": req.commands,
            "actAs": req.act_as,
            "readAs": req.read_as,
            "disclosedContracts": req.disclosed_contracts,
            "synchronizerId": req.synchronizer_id.clone().unwrap_or_default(),
            "packageIdSelectionPreference": req.package_id_selection_preference,
            "verboseHashing": false,
            "prefetchContractKeys": [],
            "estimateTrafficCost": {
                "disabled": false,
                "expectedSignatures": req.expected_signatures
            }
        });
        let obj = body.as_object_mut().expect("json object");
        if let Some(user) = req.user_id.clone().or_else(|| self.default_user_id.clone()) {
            obj.insert("userId".into(), json!(user));
        }
        if let Some(secs) = req.min_ledger_time_rel_secs {
            obj.insert(
                "minLedgerTime".into(),
                json!({"time": {"MinLedgerTimeRel": {"value": {"seconds": secs, "nanos": 0}}}}),
            );
        }
        body
    }

    fn on_prepared(
        &self,
        request: &SimulationRequest,
        resp: crate::ledger::PrepareResponse,
        report: &mut SimulationReport,
    ) {
        report.outcome = Outcome::WouldSucceed;
        match prepared::decode_prepared(&resp.prepared_transaction_base64) {
            Ok((tx, size)) => match prepared::effects_of(
                &tx,
                size,
                &resp.prepared_transaction_hash_base64,
                &resp.hashing_scheme_version,
                request.include_arguments,
            ) {
                Ok(fx) => {
                    if request.synchronizer_id.as_deref().unwrap_or("").is_empty()
                        && !fx.synchronizer_id.is_empty()
                    {
                        report.caveats.push(format!(
                            "no synchronizerId was prescribed; the participant routed to {}.",
                            fx.synchronizer_id
                        ));
                    }
                    if let Some(t) = &fx.max_record_time {
                        report.caveats.push(format!(
                            "the prepared transaction is only valid until {t} (maxRecordTime); a real submission must be prepared afresh."
                        ));
                    }
                    report.effects = Some(fx);
                }
                Err(e) => report.caveats.push(format!(
                    "prepared transaction decoded but effects could not be derived: {e}"
                )),
            },
            Err(e) => report
                .caveats
                .push(format!("prepared transaction could not be decoded: {e}")),
        }
        match resp.cost_estimation {
            Some(cost) => report.traffic = Some(quote_traffic(cost, &self.fee_schedule.traffic)),
            None => report.caveats.push(
                "the participant returned no costEstimation (Canton < 3.4 or estimation disabled); traffic cost unknown.".into(),
            ),
        }
        report.amulet_fee = amulet_fee_for(&request.commands, &self.fee_schedule);
        report.caveats.push(
            "prepare covers Daml interpretation and authorization on this participant; contention on input contracts, package vetting on counterparties' participants and sequencer-time checks are only verified at confirmation.".into(),
        );
        report.caveats.push(
            "the traffic estimate assumes this participant submits; request amplification and reassignments are not included.".into(),
        );
        if request.include_prepared_transaction {
            report.prepared_transaction_base64 = Some(resp.prepared_transaction_base64);
            report.prepared_transaction_hash_base64 = Some(resp.prepared_transaction_hash_base64);
        }
    }

    async fn on_rejected(
        &self,
        request: &SimulationRequest,
        err: LedgerError,
        report: &mut SimulationReport,
    ) {
        report.outcome = Outcome::WouldFail;
        let mut diagnosis = diagnose(&err);
        if request.lookup_contracts
            && matches!(diagnosis.phase, Phase::Interpretation | Phase::Confirmation)
        {
            let mut parties = request.act_as.clone();
            parties.extend(request.read_as.iter().cloned());
            let cids: Vec<String> = diagnosis
                .extracted
                .contract_ids
                .iter()
                .take(self.max_contract_lookups)
                .cloned()
                .collect();
            for cid in cids {
                let state = self.lookup_contract(&cid, &parties).await;
                enrich_with_state(&mut diagnosis, &state);
                report.contract_states.push(state);
            }
        }
        report.amulet_fee = amulet_fee_for(&request.commands, &self.fee_schedule);
        report.diagnosis = Some(diagnosis);
    }

    async fn lookup_contract(&self, contract_id: &str, parties: &[String]) -> ContractState {
        match self.client.contract_events(contract_id, parties).await {
            Ok(ev) => {
                let template = ev
                    .created
                    .as_ref()
                    .and_then(|c| c.get("createdEvent"))
                    .and_then(|c| c.get("templateId"))
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let created_at_offset = ev
                    .created
                    .as_ref()
                    .and_then(|c| c.get("createdEvent"))
                    .and_then(|c| c.get("offset"))
                    .and_then(Value::as_i64);
                match (&ev.created, &ev.archived) {
                    (_, Some(a)) => ContractState::Archived {
                        contract_id: contract_id.to_string(),
                        template_id: template,
                        created_at_offset,
                        archived_at_offset: a
                            .get("archivedEvent")
                            .and_then(|e| e.get("offset"))
                            .and_then(Value::as_i64),
                    },
                    (Some(_), None) => ContractState::Active {
                        contract_id: contract_id.to_string(),
                        template_id: template,
                        created_at_offset,
                    },
                    (None, None) => ContractState::Unknown {
                        contract_id: contract_id.to_string(),
                    },
                }
            }
            Err(e) => ContractState::LookupFailed {
                contract_id: contract_id.to_string(),
                error: e.to_string(),
            },
        }
    }
}

fn enrich_with_state(d: &mut Diagnosis, state: &ContractState) {
    let hint = match state {
        ContractState::Archived {
            contract_id,
            archived_at_offset,
            template_id,
            ..
        } => format!(
            "Contract {} ({}) is ARCHIVED{} — it was consumed by an earlier transaction; query the active contract set for its successor.",
            short(contract_id),
            template_id.as_deref().unwrap_or("template unknown"),
            archived_at_offset
                .map(|o| format!(" at offset {o}"))
                .unwrap_or_default()
        ),
        ContractState::Active { contract_id, .. } => format!(
            "Contract {} is ACTIVE and visible to the acting parties, so the failure is not about its existence; check authorization and the choice arguments.",
            short(contract_id)
        ),
        ContractState::Unknown { contract_id } => format!(
            "Contract {} has never been seen by this participant for the acting/reading parties: wrong participant, wrong party set, or the contract must be passed as a disclosed contract.",
            short(contract_id)
        ),
        ContractState::LookupFailed { contract_id, error } => {
            format!(
                "Contract {} could not be looked up: {error}",
                short(contract_id)
            )
        }
    };
    d.hints.insert(0, hint);
}

fn short(cid: &str) -> String {
    if cid.len() > 18 {
        format!("{}…{}", &cid[..10], &cid[cid.len() - 6..])
    } else {
        cid.to_string()
    }
}

/// Detect Canton Coin transfers in the command list and quote Splice fees.
///
/// Recognised shapes:
/// - `AmuletRules_Transfer` with `choiceArgument.transfer.{sender,outputs[{receiver,amount}]}`
/// - token-standard `TransferFactory_Transfer` with
///   `choiceArgument.transfer.{sender,receiver,amount,instrumentId.id == "Amulet"}`
pub fn amulet_fee_for(commands: &[Value], schedule: &FeeSchedule) -> Option<AmuletFeeQuote> {
    let mut outputs: Vec<TransferOutput> = Vec::new();
    for cmd in commands {
        let Some(ex) = cmd.get("ExerciseCommand") else {
            continue;
        };
        let choice = ex.get("choice").and_then(Value::as_str).unwrap_or("");
        let arg = ex.get("choiceArgument").unwrap_or(&Value::Null);
        match choice {
            "AmuletRules_Transfer" => {
                let transfer = arg.get("transfer").unwrap_or(&Value::Null);
                let sender = transfer.get("sender").and_then(Value::as_str).unwrap_or("");
                if let Some(outs) = transfer.get("outputs").and_then(Value::as_array) {
                    for o in outs {
                        let amount = o
                            .get("amount")
                            .and_then(decimal_of)
                            .unwrap_or(Decimal::ZERO);
                        let receiver = o.get("receiver").and_then(Value::as_str).unwrap_or("");
                        let lock_holders = o
                            .get("lock")
                            .and_then(|l| l.get("holders"))
                            .and_then(Value::as_array)
                            .map(|h| h.len() as u32)
                            .unwrap_or(0);
                        outputs.push(TransferOutput {
                            amount_cc: amount,
                            to_self: !sender.is_empty() && receiver == sender,
                            lock_holders,
                        });
                    }
                }
            }
            "TransferFactory_Transfer" => {
                let transfer = arg.get("transfer").unwrap_or(&Value::Null);
                let instrument = transfer
                    .get("instrumentId")
                    .and_then(|i| i.get("id"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !instrument.eq_ignore_ascii_case("Amulet") {
                    continue;
                }
                let amount = transfer
                    .get("amount")
                    .and_then(decimal_of)
                    .unwrap_or(Decimal::ZERO);
                let sender = transfer.get("sender").and_then(Value::as_str).unwrap_or("");
                let receiver = transfer
                    .get("receiver")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                outputs.push(TransferOutput {
                    amount_cc: amount,
                    to_self: !sender.is_empty() && receiver == sender,
                    lock_holders: 0,
                });
                // Splice creates a change output back to the sender.
                outputs.push(TransferOutput {
                    amount_cc: Decimal::ZERO,
                    to_self: true,
                    lock_holders: 0,
                });
            }
            _ => {}
        }
    }
    if outputs.is_empty() {
        return None;
    }
    Some(quote_amulet_transfer(
        &outputs,
        &schedule.amulet,
        schedule.traffic.amulet_price_usd,
    ))
}

fn decimal_of(v: &Value) -> Option<Decimal> {
    match v {
        Value::String(s) => Decimal::from_str(s.trim()).ok(),
        Value::Number(n) => Decimal::from_str(&n.to_string()).ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_amulet_rules_transfer() {
        let cmds = vec![json!({"ExerciseCommand": {
            "templateId": "#splice-amulet:Splice.AmuletRules:AmuletRules",
            "contractId": "00aa",
            "choice": "AmuletRules_Transfer",
            "choiceArgument": {"transfer": {
                "sender": "alice::1",
                "provider": "alice::1",
                "outputs": [
                    {"receiver": "bob::2", "amount": "10000.0"},
                    {"receiver": "alice::1", "amount": "5.0"}
                ]
            }}
        }})];
        let q = amulet_fee_for(&cmds, &FeeSchedule::splice_defaults()).unwrap();
        assert_eq!(q.outputs, 2);
        // 10000 CC * 0.005 = 50 USD → 1% = 0.5 USD; + 2 create fees 0.06
        assert_eq!(q.total_usd, Decimal::from_str("0.56").unwrap());
    }

    #[test]
    fn ignores_non_amulet_token_standard_transfers() {
        let cmds = vec![json!({"ExerciseCommand": {
            "templateId": "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory",
            "contractId": "00aa",
            "choice": "TransferFactory_Transfer",
            "choiceArgument": {"transfer": {"sender": "a", "receiver": "b", "amount": "1", "instrumentId": {"admin": "x", "id": "USDCx"}}}
        }})];
        assert!(amulet_fee_for(&cmds, &FeeSchedule::splice_defaults()).is_none());
    }
}
