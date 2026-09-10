//! Fee estimation for Canton transactions.
//!
//! Two cost components exist on the Canton Network:
//!
//! 1. **Synchronizer traffic.** Every confirmation request/response is paid for
//!    in traffic units (bytes) on the Global Synchronizer. The participant
//!    returns a traffic cost estimate from `/v2/interactive-submission/prepare`
//!    ([`TrafficCost`]); extra traffic is bought with Canton Coin at the price
//!    configured in `AmuletRules.transferConfig.extraTrafficPrice` (USD per MB)
//!    and converted with the current round's `amuletPrice` (USD per CC).
//!    [`TrafficPricing`] turns the byte estimate into USD and CC.
//!
//! 2. **Amulet (Canton Coin) transfer fees.** Transfers of CC pay Splice's
//!    step-function transfer fee plus per-output create fees and lock-holder
//!    fees, all denominated in USD and settled in CC. [`AmuletFeeSchedule`]
//!    models this for pre-submit quotes.
//!
//! All numbers are `rust_decimal::Decimal` — no floats on the money path. The
//! defaults are the Splice reference values; production quotes must load the
//! live configuration from a Scan instance ([`FeeSchedule::from_scan_json`]).

use rust_decimal::Decimal;
use rust_decimal::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Traffic cost estimate as returned by the participant (bytes).
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrafficCost {
    /// Cost of the confirmation request this participant sends.
    pub confirmation_request: u64,
    /// Cost of the confirmation response (also what other confirming
    /// participants of the party will pay to approve/reject).
    pub confirmation_response: u64,
    /// `confirmation_request + confirmation_response`.
    pub total: u64,
}

impl TrafficCost {
    pub fn new(confirmation_request: u64, confirmation_response: u64) -> Self {
        Self {
            confirmation_request,
            confirmation_response,
            total: confirmation_request + confirmation_response,
        }
    }
}

/// Prices needed to convert traffic bytes into money.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrafficPricing {
    /// `AmuletRules.transferConfig.extraTrafficPrice`, USD per megabyte.
    pub extra_traffic_price_usd_per_mb: Decimal,
    /// `OpenMiningRound.amuletPrice`, USD per Canton Coin.
    pub amulet_price_usd: Decimal,
    /// Minimum top-up purchase in bytes (`minTopupAmount`), if known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_topup_bytes: Option<u64>,
    /// Where these values came from (`splice-defaults`, `scan:<url>`, `cli`).
    pub source: String,
}

impl TrafficPricing {
    /// Splice reference defaults. **Not** authoritative for any network;
    /// load live values from Scan for real quotes.
    pub fn splice_defaults() -> Self {
        Self {
            extra_traffic_price_usd_per_mb: dec("60.0"),
            amulet_price_usd: dec("0.005"),
            min_topup_bytes: None,
            source: "splice-defaults".into(),
        }
    }
}

/// A priced traffic estimate.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrafficQuote {
    pub cost: TrafficCost,
    pub usd: Decimal,
    pub cc: Decimal,
    /// Base-rate traffic is free: this is what the transaction would cost if
    /// it had to be paid entirely from purchased extra traffic.
    pub note: String,
    pub pricing: TrafficPricing,
}

/// Convert a traffic estimate into USD and CC.
pub fn quote_traffic(cost: TrafficCost, pricing: &TrafficPricing) -> TrafficQuote {
    let mb = Decimal::from(cost.total) / Decimal::from(1_000_000u64);
    let usd = (mb * pricing.extra_traffic_price_usd_per_mb).round_dp(10);
    let cc = if pricing.amulet_price_usd.is_zero() {
        Decimal::ZERO
    } else {
        (usd / pricing.amulet_price_usd).round_dp(10)
    };
    TrafficQuote {
        cost,
        usd,
        cc,
        note: "Upper bound: participants receive a free base-rate traffic allowance; only traffic above it is paid from purchased extra traffic.".into(),
        pricing: pricing.clone(),
    }
}

/// Splice `TransferConfigUSD` — the Amulet fee schedule.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AmuletFeeSchedule {
    /// USD charged per output Amulet contract created (`createFee`).
    pub create_fee_usd: Decimal,
    /// USD per round per CC held (`holdingFee.rate`).
    pub holding_fee_usd_per_round: Decimal,
    /// USD per lock holder (`lockHolderFee`).
    pub lock_holder_fee_usd: Decimal,
    /// Rate applied to the first step of the transfer amount (`transferFee.initialRate`).
    pub transfer_fee_initial_rate: Decimal,
    /// `(threshold_usd, rate)` steps: amounts above `threshold_usd` are charged
    /// at `rate` up to the next threshold.
    pub transfer_fee_steps: Vec<(Decimal, Decimal)>,
    pub source: String,
}

impl AmuletFeeSchedule {
    /// Splice reference defaults (`splice-amulet` `TransferConfigUSD`).
    pub fn splice_defaults() -> Self {
        Self {
            create_fee_usd: dec("0.03"),
            holding_fee_usd_per_round: dec("0.0000190259"),
            lock_holder_fee_usd: dec("0.005"),
            transfer_fee_initial_rate: dec("0.01"),
            transfer_fee_steps: vec![
                (dec("100.0"), dec("0.001")),
                (dec("1000.0"), dec("0.0001")),
                (dec("1000000.0"), dec("0.00001")),
            ],
            source: "splice-defaults".into(),
        }
    }

    /// Transfer fee in USD for a single output of `amount_usd` sent to another party.
    pub fn transfer_fee_usd(&self, amount_usd: Decimal) -> Decimal {
        if amount_usd <= Decimal::ZERO {
            return Decimal::ZERO;
        }
        let mut fee = Decimal::ZERO;
        let mut lower = Decimal::ZERO;
        let mut rate = self.transfer_fee_initial_rate;
        for (threshold, next_rate) in &self.transfer_fee_steps {
            if amount_usd <= *threshold {
                fee += (amount_usd - lower) * rate;
                return fee.round_dp(10);
            }
            fee += (*threshold - lower) * rate;
            lower = *threshold;
            rate = *next_rate;
        }
        fee += (amount_usd - lower) * rate;
        fee.round_dp(10)
    }
}

/// One output of an Amulet transfer, for fee purposes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TransferOutput {
    /// Amount in CC.
    pub amount_cc: Decimal,
    /// Whether the receiver is the sender (self-transfers pay no transfer fee).
    #[serde(default)]
    pub to_self: bool,
    /// Number of lock holders on the output (0 for a plain transfer).
    #[serde(default)]
    pub lock_holders: u32,
}

/// Breakdown of an Amulet transfer fee quote.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AmuletFeeQuote {
    pub amulet_price_usd: Decimal,
    pub transfer_fee_usd: Decimal,
    pub create_fee_usd: Decimal,
    pub lock_holder_fee_usd: Decimal,
    pub total_usd: Decimal,
    pub total_cc: Decimal,
    pub outputs: usize,
    pub schedule_source: String,
}

/// Quote the sender-paid fees of an Amulet transfer with the given outputs.
///
/// Splice charges one create fee per output (including the sender's change
/// output, which callers should include as a `to_self` output), the transfer
/// fee on each output to another party, and a lock-holder fee per holder.
pub fn quote_amulet_transfer(
    outputs: &[TransferOutput],
    schedule: &AmuletFeeSchedule,
    amulet_price_usd: Decimal,
) -> AmuletFeeQuote {
    let mut transfer_fee = Decimal::ZERO;
    let mut lock_fee = Decimal::ZERO;
    for o in outputs {
        let usd = o.amount_cc * amulet_price_usd;
        if !o.to_self {
            transfer_fee += schedule.transfer_fee_usd(usd);
        }
        lock_fee += schedule.lock_holder_fee_usd * Decimal::from(o.lock_holders);
    }
    let create_fee = schedule.create_fee_usd * Decimal::from(outputs.len() as u64);
    let total_usd = (transfer_fee + create_fee + lock_fee).round_dp(10);
    let total_cc = if amulet_price_usd.is_zero() {
        Decimal::ZERO
    } else {
        (total_usd / amulet_price_usd).round_dp(10)
    };
    AmuletFeeQuote {
        amulet_price_usd,
        transfer_fee_usd: transfer_fee.round_dp(10),
        create_fee_usd: create_fee,
        lock_holder_fee_usd: lock_fee,
        total_usd,
        total_cc,
        outputs: outputs.len(),
        schedule_source: schedule.source.clone(),
    }
}

/// Combined schedule: traffic pricing + Amulet fees.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FeeSchedule {
    pub traffic: TrafficPricing,
    pub amulet: AmuletFeeSchedule,
}

#[derive(Debug, thiserror::Error)]
pub enum FeeError {
    #[error("Scan response has no `transferConfig` object")]
    MissingTransferConfig,
    #[error("Scan response has no `amuletPrice`")]
    MissingAmuletPrice,
    #[error("invalid decimal in Scan response at `{0}`")]
    BadDecimal(String),
}

impl FeeSchedule {
    pub fn splice_defaults() -> Self {
        Self {
            traffic: TrafficPricing::splice_defaults(),
            amulet: AmuletFeeSchedule::splice_defaults(),
        }
    }

    /// Build a schedule from Scan API JSON.
    ///
    /// `amulet_rules` is the body of `GET /api/scan/v0/amulet-rules`;
    /// `mining_rounds` is the body of
    /// `GET /api/scan/v0/open-and-issuing-mining-rounds`. The parser walks
    /// the documents for the `transferConfig` record and the newest
    /// `amuletPrice`, so it tolerates the wrapping differences between Scan
    /// versions.
    pub fn from_scan_json(
        amulet_rules: &Value,
        mining_rounds: &Value,
        source: &str,
    ) -> Result<Self, FeeError> {
        let cfg =
            find_key(amulet_rules, "transferConfig").ok_or(FeeError::MissingTransferConfig)?;
        let d = |path: &[&str]| -> Result<Decimal, FeeError> {
            let mut cur = cfg;
            for p in path {
                cur = cur.get(*p).unwrap_or(&Value::Null);
            }
            decimal_of(cur).ok_or_else(|| FeeError::BadDecimal(path.join(".")))
        };
        let mut steps = Vec::new();
        if let Some(arr) = cfg
            .get("transferFee")
            .and_then(|t| t.get("steps"))
            .and_then(Value::as_array)
        {
            for s in arr {
                let (a, b) = match s {
                    Value::Array(p) if p.len() == 2 => (&p[0], &p[1]),
                    Value::Object(o) => (
                        o.get("_1").unwrap_or(&Value::Null),
                        o.get("_2").unwrap_or(&Value::Null),
                    ),
                    _ => continue,
                };
                let a = decimal_of(a)
                    .ok_or_else(|| FeeError::BadDecimal("transferFee.steps._1".into()))?;
                let b = decimal_of(b)
                    .ok_or_else(|| FeeError::BadDecimal("transferFee.steps._2".into()))?;
                steps.push((a, b));
            }
        }
        let amulet_price =
            newest_amulet_price(mining_rounds).ok_or(FeeError::MissingAmuletPrice)?;
        let min_topup = cfg
            .get("minTopupAmount")
            .and_then(decimal_of)
            .and_then(|v| v.to_u64());
        Ok(Self {
            traffic: TrafficPricing {
                extra_traffic_price_usd_per_mb: d(&["extraTrafficPrice"])?,
                amulet_price_usd: amulet_price,
                min_topup_bytes: min_topup,
                source: source.to_string(),
            },
            amulet: AmuletFeeSchedule {
                create_fee_usd: d(&["createFee", "fee"])?,
                holding_fee_usd_per_round: d(&["holdingFee", "rate"])?,
                lock_holder_fee_usd: d(&["lockHolderFee", "fee"])?,
                transfer_fee_initial_rate: d(&["transferFee", "initialRate"])?,
                transfer_fee_steps: steps,
                source: source.to_string(),
            },
        })
    }
}

/// Depth-first search for the first object under `key`.
fn find_key<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    match v {
        Value::Object(o) => {
            if let Some(hit) = o.get(key) {
                return Some(hit);
            }
            o.values().find_map(|c| find_key(c, key))
        }
        Value::Array(a) => a.iter().find_map(|c| find_key(c, key)),
        _ => None,
    }
}

/// Pick the `amuletPrice` of the open mining round with the highest round number.
fn newest_amulet_price(v: &Value) -> Option<Decimal> {
    let mut best: Option<(i64, Decimal)> = None;
    collect_prices(v, &mut best);
    best.map(|(_, p)| p)
}

fn collect_prices(v: &Value, best: &mut Option<(i64, Decimal)>) {
    match v {
        Value::Object(o) => {
            if let Some(price) = o.get("amuletPrice").and_then(decimal_of) {
                let round = o
                    .get("round")
                    .and_then(|r| r.get("number").or(Some(r)))
                    .and_then(|n| {
                        n.as_i64()
                            .or_else(|| n.as_str().and_then(|s| s.parse().ok()))
                    })
                    .unwrap_or(-1);
                if best.map(|(r, _)| round >= r).unwrap_or(true) {
                    *best = Some((round, price));
                }
            }
            for c in o.values() {
                collect_prices(c, best);
            }
        }
        Value::Array(a) => a.iter().for_each(|c| collect_prices(c, best)),
        _ => {}
    }
}

fn decimal_of(v: &Value) -> Option<Decimal> {
    match v {
        Value::String(s) => Decimal::from_str(s.trim()).ok(),
        Value::Number(n) => Decimal::from_str(&n.to_string()).ok(),
        _ => None,
    }
}

fn dec(s: &str) -> Decimal {
    Decimal::from_str(s).expect("valid decimal literal")
}

/// A standalone fee quote from raw inputs, without a participant: the traffic
/// part when any bytes are given, the Amulet part when any transfer amounts
/// are given. This is what `canton-sim fee` and `POST /v1/fee` compute; a
/// zero-amount self "change" output is appended so the create fee matches a
/// real transfer, which always returns change to the sender.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StandaloneFeeQuote {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub traffic: Option<TrafficQuote>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amulet_fee: Option<AmuletFeeQuote>,
    pub schedule: FeeSchedule,
}

/// Returns `None` when neither bytes nor transfer amounts were given, so the
/// caller can report a usage error rather than an empty quote.
pub fn quote_standalone(
    schedule: &FeeSchedule,
    request_bytes: u64,
    response_bytes: u64,
    transfer_cc: &[Decimal],
) -> Option<StandaloneFeeQuote> {
    let traffic = (request_bytes + response_bytes > 0).then(|| {
        quote_traffic(
            TrafficCost::new(request_bytes, response_bytes),
            &schedule.traffic,
        )
    });
    let amulet_fee = (!transfer_cc.is_empty()).then(|| {
        let mut outputs: Vec<TransferOutput> = transfer_cc
            .iter()
            .map(|amt| TransferOutput {
                amount_cc: *amt,
                to_self: false,
                lock_holders: 0,
            })
            .collect();
        outputs.push(TransferOutput {
            amount_cc: Decimal::ZERO,
            to_self: true,
            lock_holders: 0,
        });
        quote_amulet_transfer(
            &outputs,
            &schedule.amulet,
            schedule.traffic.amulet_price_usd,
        )
    });
    if traffic.is_none() && amulet_fee.is_none() {
        return None;
    }
    Some(StandaloneFeeQuote {
        traffic,
        amulet_fee,
        schedule: schedule.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standalone_quote_needs_at_least_one_input() {
        let s = FeeSchedule::splice_defaults();
        assert!(quote_standalone(&s, 0, 0, &[]).is_none());
        let t = quote_standalone(&s, 4000, 500, &[]).unwrap();
        assert!(t.traffic.is_some() && t.amulet_fee.is_none());
        assert_eq!(t.traffic.unwrap().cost.total, 4500);
        let a = quote_standalone(&s, 0, 0, &[Decimal::from(10_000)]).unwrap();
        assert!(a.traffic.is_none());
        // one output to another party plus the change output
        assert_eq!(a.amulet_fee.as_ref().unwrap().outputs, 2);
        assert!(a.amulet_fee.unwrap().total_usd > Decimal::ZERO);
    }

    #[test]
    fn traffic_quote_converts_bytes_to_cc() {
        let pricing = TrafficPricing::splice_defaults(); // 60 USD/MB, 0.005 USD/CC
        let q = quote_traffic(TrafficCost::new(4_000, 1_000), &pricing);
        assert_eq!(q.cost.total, 5_000);
        assert_eq!(q.usd, dec("0.3")); // 0.005 MB * 60
        assert_eq!(q.cc, dec("60")); // 0.3 / 0.005
    }

    #[test]
    fn transfer_fee_is_a_step_function() {
        let s = AmuletFeeSchedule::splice_defaults();
        assert_eq!(s.transfer_fee_usd(dec("50")), dec("0.5")); // 1% of 50
        assert_eq!(s.transfer_fee_usd(dec("100")), dec("1.0"));
        // 100 * 1% + 900 * 0.1% = 1 + 0.9
        assert_eq!(s.transfer_fee_usd(dec("1000")), dec("1.9"));
        // + 999000 * 0.01% = 99.9
        assert_eq!(s.transfer_fee_usd(dec("1000000")), dec("101.8"));
        // + 1_000_000 * 0.001% = 10
        assert_eq!(s.transfer_fee_usd(dec("2000000")), dec("111.8"));
        assert_eq!(s.transfer_fee_usd(dec("0")), Decimal::ZERO);
    }

    #[test]
    fn amulet_quote_adds_create_and_lock_fees() {
        let s = AmuletFeeSchedule::splice_defaults();
        let outputs = vec![
            TransferOutput {
                amount_cc: dec("10000"),
                to_self: false,
                lock_holders: 0,
            }, // 50 USD
            TransferOutput {
                amount_cc: dec("500"),
                to_self: true,
                lock_holders: 0,
            }, // change
        ];
        let q = quote_amulet_transfer(&outputs, &s, dec("0.005"));
        assert_eq!(q.transfer_fee_usd, dec("0.5"));
        assert_eq!(q.create_fee_usd, dec("0.06"));
        assert_eq!(q.total_usd, dec("0.56"));
        assert_eq!(q.total_cc, dec("112"));
    }

    #[test]
    fn schedule_parses_scan_json_shapes() {
        let rules = serde_json::json!({
            "amulet_rules_update": {"contract": {"payload": {"configSchedule": {"initialValue": {
                "transferConfig": {
                    "createFee": {"fee": "0.03"},
                    "holdingFee": {"rate": "0.0000190259"},
                    "lockHolderFee": {"fee": "0.005"},
                    "transferFee": {"initialRate": "0.01", "steps": [
                        {"_1": "100.0", "_2": "0.001"}, ["1000.0", "0.0001"]
                    ]},
                    "extraTrafficPrice": "60.0",
                    "minTopupAmount": "1000000"
                }
            }}}}}
        });
        let rounds = serde_json::json!({
            "open_mining_rounds": [
                {"contract": {"payload": {"amuletPrice": "0.004", "round": {"number": "41"}}}},
                {"contract": {"payload": {"amuletPrice": "0.0055", "round": {"number": "42"}}}}
            ]
        });
        let s = FeeSchedule::from_scan_json(&rules, &rounds, "scan:test").unwrap();
        assert_eq!(s.traffic.amulet_price_usd, dec("0.0055"));
        assert_eq!(s.traffic.extra_traffic_price_usd_per_mb, dec("60.0"));
        assert_eq!(s.traffic.min_topup_bytes, Some(1_000_000));
        assert_eq!(s.amulet.transfer_fee_steps.len(), 2);
        assert_eq!(
            s.amulet.transfer_fee_steps[1],
            (dec("1000.0"), dec("0.0001"))
        );
    }

    #[test]
    fn schedule_errors_on_missing_config() {
        let e = FeeSchedule::from_scan_json(&serde_json::json!({}), &serde_json::json!({}), "x");
        assert!(matches!(e, Err(FeeError::MissingTransferConfig)));
    }
}
