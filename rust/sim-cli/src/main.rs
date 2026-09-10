//! `canton-sim` — pre-submit simulation, failure explanation and fee
//! estimation for Canton transactions.

use anyhow::{Context, Result, bail};
use canton_sim_core::render::report_to_text;
use canton_sim_core::{JsonLedgerClient, SimulationRequest, Simulator, TokenSource, prepared};
use canton_sim_diagnose::{LedgerError, catalog, diagnose};
use canton_sim_fee::{FeeSchedule, TrafficPricing, quote_standalone};
use clap::{Args, Parser, Subcommand};
use rust_decimal::Decimal;
use serde_json::{Value, json};
use std::io::Read;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;

#[derive(Parser)]
#[command(
    name = "canton-sim",
    version,
    about = "Simulate a Canton transaction before submitting it: ledger effects, failure explanation, traffic & fee estimate",
    long_about = None
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Dry-run a command against a participant (never submits).
    Simulate(SimulateArgs),
    /// Explain a Canton error (code, JSON error body, or log line).
    Explain(ExplainArgs),
    /// Decode a base64 PreparedTransaction into its ledger effects.
    Effects(EffectsArgs),
    /// Price a traffic estimate / Amulet transfer without a participant.
    Fee(FeeArgs),
    /// List the error catalog.
    Catalog(CatalogArgs),
    /// Show whether a contract is active, archived or unknown to the participant.
    Contract(ContractArgs),
}

#[derive(Args)]
struct ContractArgs {
    #[command(flatten)]
    ledger: LedgerArgs,
    /// Contract id.
    contract_id: String,
    /// Party whose visibility to use (repeatable).
    #[arg(long = "party", required = true)]
    parties: Vec<String>,
    #[arg(long)]
    json: bool,
}

#[derive(Args, Clone)]
struct LedgerArgs {
    /// JSON Ledger API base URL (with or without /v2).
    #[arg(long, env = "CANTON_SIM_LEDGER_URL")]
    ledger: String,
    /// Bearer token value.
    #[arg(long, env = "CANTON_SIM_TOKEN", conflicts_with = "token_file")]
    token: Option<String>,
    /// File containing the bearer token.
    #[arg(long, env = "CANTON_SIM_TOKEN_FILE")]
    token_file: Option<PathBuf>,
    /// Ledger API user id (omit when the token carries one).
    #[arg(long, env = "CANTON_SIM_USER_ID")]
    user_id: Option<String>,
}

impl LedgerArgs {
    fn client(&self) -> Result<JsonLedgerClient> {
        let token = match (&self.token, &self.token_file) {
            (Some(t), _) => TokenSource::Static(t.clone()),
            (None, Some(f)) => TokenSource::File(f.clone()),
            (None, None) => TokenSource::None,
        };
        Ok(JsonLedgerClient::new(&self.ledger, token)?)
    }
}

#[derive(Args, Clone)]
struct PricingArgs {
    /// Scan base URL to load the live fee schedule (AmuletRules + amulet price).
    #[arg(long, env = "CANTON_SIM_SCAN_URL")]
    scan: Option<String>,
    /// Override: extra traffic price in USD per MB.
    #[arg(long)]
    traffic_usd_per_mb: Option<Decimal>,
    /// Override: amulet (CC) price in USD.
    #[arg(long)]
    cc_usd: Option<Decimal>,
}

impl PricingArgs {
    async fn schedule(&self) -> Result<FeeSchedule> {
        let mut s = match &self.scan {
            Some(url) => canton_sim_core::scan::fetch_fee_schedule(url)
                .await
                .with_context(|| format!("load fee schedule from Scan {url}"))?,
            None => FeeSchedule::splice_defaults(),
        };
        if let Some(p) = self.traffic_usd_per_mb {
            s.traffic.extra_traffic_price_usd_per_mb = p;
            s.traffic.source = "cli".into();
        }
        if let Some(p) = self.cc_usd {
            s.traffic.amulet_price_usd = p;
            s.traffic.source = "cli".into();
        }
        Ok(s)
    }
}

#[derive(Args)]
struct SimulateArgs {
    #[command(flatten)]
    ledger: LedgerArgs,
    #[command(flatten)]
    pricing: PricingArgs,
    /// Party to act as (repeatable).
    #[arg(long = "act-as", required = true)]
    act_as: Vec<String>,
    /// Party to read as (repeatable).
    #[arg(long = "read-as")]
    read_as: Vec<String>,
    /// Prescribed synchronizer id (omit to let the participant route).
    #[arg(long)]
    synchronizer_id: Option<String>,
    /// Command id (generated when omitted).
    #[arg(long)]
    command_id: Option<String>,
    /// File with the command(s): a JSON Ledger API Command object, an array of
    /// them, or a full simulation request object. `-` reads stdin.
    #[arg(value_name = "COMMANDS_JSON", default_value = "-")]
    commands: String,
    /// Do not look up referenced contracts on failure.
    #[arg(long)]
    no_lookup: bool,
    /// Omit decoded create/choice arguments from the effects.
    #[arg(long)]
    no_arguments: bool,
    /// Include the raw base64 prepared transaction in JSON output.
    #[arg(long)]
    include_prepared: bool,
    /// Output the report as JSON instead of text.
    #[arg(long)]
    json: bool,
    /// Exit with status 2 when the simulation says the command would fail.
    #[arg(long)]
    fail_on_reject: bool,
}

#[derive(Args)]
struct ExplainArgs {
    /// Error code, JSON error body, log line, or `-` for stdin.
    input: String,
    #[arg(long)]
    json: bool,
}

#[derive(Args)]
struct EffectsArgs {
    /// File with the base64 prepared transaction (or a prepare response JSON), `-` for stdin.
    input: String,
    #[arg(long)]
    json: bool,
}

#[derive(Args)]
struct FeeArgs {
    #[command(flatten)]
    pricing: PricingArgs,
    /// Traffic bytes of the confirmation request.
    #[arg(long, default_value_t = 0)]
    request_bytes: u64,
    /// Traffic bytes of the confirmation response.
    #[arg(long, default_value_t = 0)]
    response_bytes: u64,
    /// Amulet transfer output amounts in CC to other parties (repeatable).
    #[arg(long = "transfer-cc")]
    transfer_cc: Vec<Decimal>,
    #[arg(long)]
    json: bool,
}

#[derive(Args)]
struct CatalogArgs {
    /// Only codes containing this substring.
    #[arg(long)]
    filter: Option<String>,
    #[arg(long)]
    json: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .with_writer(std::io::stderr)
        .init();
    let cli = Cli::parse();
    match cli.command {
        Command::Simulate(a) => simulate(a).await,
        Command::Explain(a) => explain(a),
        Command::Effects(a) => effects(a),
        Command::Fee(a) => fee(a).await,
        Command::Catalog(a) => catalog_cmd(a),
        Command::Contract(a) => contract(a).await,
    }
}

async fn contract(a: ContractArgs) -> Result<()> {
    use canton_sim_core::LedgerApi;
    let client = a.ledger.client()?;
    let ev = client.contract_events(&a.contract_id, &a.parties).await?;
    if a.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({"created": ev.created, "archived": ev.archived}))?
        );
        return Ok(());
    }
    let offset = |v: &Option<Value>, key: &str| {
        v.as_ref()
            .and_then(|e| e.get(key))
            .and_then(|e| e.get("offset"))
            .map(|o| o.to_string())
            .unwrap_or_else(|| "?".into())
    };
    match (&ev.created, &ev.archived) {
        (_, Some(_)) => println!(
            "{} ARCHIVED (created at offset {}, archived at offset {})",
            a.contract_id,
            offset(&ev.created, "createdEvent"),
            offset(&ev.archived, "archivedEvent")
        ),
        (Some(c), None) => println!(
            "{} ACTIVE (template {}, created at offset {})",
            a.contract_id,
            c.get("createdEvent")
                .and_then(|e| e.get("templateId"))
                .and_then(Value::as_str)
                .unwrap_or("?"),
            offset(&ev.created, "createdEvent")
        ),
        (None, None) => println!(
            "{} UNKNOWN to this participant for parties {}",
            a.contract_id,
            a.parties.join(", ")
        ),
    }
    Ok(())
}

fn read_input(spec: &str) -> Result<String> {
    if spec == "-" {
        let mut s = String::new();
        std::io::stdin()
            .read_to_string(&mut s)
            .context("read stdin")?;
        Ok(s)
    } else if std::path::Path::new(spec).exists() {
        std::fs::read_to_string(spec).with_context(|| format!("read {spec}"))
    } else {
        Ok(spec.to_string())
    }
}

/// Accept a Command object, an array of Commands, or a full request object.
fn parse_commands_input(text: &str) -> Result<(Vec<Value>, Option<SimulationRequest>)> {
    let v: Value = serde_json::from_str(text).context("commands input is not valid JSON")?;
    if let Some(arr) = v.as_array() {
        return Ok((arr.clone(), None));
    }
    let obj = v
        .as_object()
        .context("commands input must be a JSON object or array")?;
    if obj.contains_key("commands") && obj.contains_key("act_as") {
        let req: SimulationRequest =
            serde_json::from_value(v.clone()).context("parse simulation request")?;
        return Ok((req.commands.clone(), Some(req)));
    }
    if obj.keys().any(|k| k.ends_with("Command")) {
        return Ok((vec![v], None));
    }
    bail!(
        "unrecognised commands input: expected {{\"ExerciseCommand\": …}}, an array of commands, or a simulation request"
    );
}

async fn simulate(a: SimulateArgs) -> Result<()> {
    let text = read_input(&a.commands)?;
    let (commands, embedded) = parse_commands_input(&text)?;
    let mut req = embedded.unwrap_or_else(|| SimulationRequest::new(a.act_as.clone(), commands));
    if !a.act_as.is_empty() {
        req.act_as = a.act_as.clone();
    }
    if !a.read_as.is_empty() {
        req.read_as = a.read_as.clone();
    }
    if a.synchronizer_id.is_some() {
        req.synchronizer_id = a.synchronizer_id.clone();
    }
    if a.command_id.is_some() {
        req.command_id = a.command_id.clone();
    }
    if a.ledger.user_id.is_some() {
        req.user_id = a.ledger.user_id.clone();
    }
    req.lookup_contracts = !a.no_lookup;
    req.include_arguments = !a.no_arguments;
    req.include_prepared_transaction = a.include_prepared;

    let client = a.ledger.client()?;
    let schedule = a.pricing.schedule().await?;
    let sim =
        Simulator::new(Arc::new(client), schedule).with_default_user_id(a.ledger.user_id.clone());
    let report = sim.simulate(req).await;
    if a.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print!("{}", report_to_text(&report));
    }
    if a.fail_on_reject && report.outcome != canton_sim_core::Outcome::WouldSucceed {
        std::process::exit(2);
    }
    Ok(())
}

fn explain(a: ExplainArgs) -> Result<()> {
    let text = read_input(&a.input)?;
    let err = LedgerError::from_text(text.trim());
    let d = diagnose(&err);
    if a.json {
        println!("{}", serde_json::to_string_pretty(&d)?);
        return Ok(());
    }
    println!("{} — {}", d.code, d.title);
    println!(
        "phase: {}   category: {}   retryable: {}",
        d.phase.label(),
        d.category.as_deref().unwrap_or("?"),
        if d.retryable { "yes" } else { "no" }
    );
    println!();
    println!("{}", d.summary);
    let x = &d.extracted;
    if let Some(t) = &x.template_id {
        println!("template: {t}");
    }
    if let Some(c) = &x.choice {
        println!("choice: {c}");
    }
    if !x.contract_ids.is_empty() {
        println!("contracts: {}", x.contract_ids.join(", "));
    }
    if !x.missing_authorizers.is_empty() {
        println!("missing authorizers: {}", x.missing_authorizers.join(", "));
    }
    if let Some(m) = &x.message {
        println!("message: {m}");
    }
    if let Some(e) = &d.explanation {
        println!();
        println!("Canton: {e}");
    }
    if let Some(r) = &d.resolution {
        println!("Canton resolution: {r}");
    }
    if !d.hints.is_empty() {
        println!();
        println!("Next steps:");
        for h in &d.hints {
            println!("  - {h}");
        }
    }
    if let Some(src) = &d.catalog_source {
        println!();
        println!("catalog source: {src}");
    }
    Ok(())
}

fn effects(a: EffectsArgs) -> Result<()> {
    let text = read_input(&a.input)?;
    let trimmed = text.trim();
    let (b64, hash, scheme) = if trimmed.starts_with('{') {
        let v: Value = serde_json::from_str(trimmed).context("parse prepare response JSON")?;
        (
            v.get("preparedTransaction")
                .and_then(Value::as_str)
                .context("JSON has no preparedTransaction")?
                .to_string(),
            v.get("preparedTransactionHash")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            v.get("hashingSchemeVersion")
                .and_then(Value::as_str)
                .unwrap_or("HASHING_SCHEME_VERSION_UNSPECIFIED")
                .to_string(),
        )
    } else {
        (
            trimmed.to_string(),
            String::new(),
            "HASHING_SCHEME_VERSION_UNSPECIFIED".to_string(),
        )
    };
    let (tx, size) = prepared::decode_prepared(&b64)?;
    let fx = prepared::effects_of(&tx, size, &hash, &scheme, true)?;
    if a.json {
        println!("{}", serde_json::to_string_pretty(&fx)?);
        return Ok(());
    }
    let report = canton_sim_core::SimulationReport {
        outcome: canton_sim_core::Outcome::WouldSucceed,
        ledger: canton_sim_core::LedgerInfo {
            base_url: "(offline)".into(),
            participant_version: None,
        },
        request: SimulationRequest::new(fx.act_as.clone(), vec![]),
        command_id: fx.command_id.clone(),
        effects: Some(fx),
        traffic: None,
        amulet_fee: None,
        diagnosis: None,
        contract_states: vec![],
        caveats: vec![],
        prepared_transaction_base64: None,
        prepared_transaction_hash_base64: None,
        elapsed_ms: 0,
        simulated_at: String::new(),
    };
    print!("{}", report_to_text(&report));
    Ok(())
}

async fn fee(a: FeeArgs) -> Result<()> {
    let schedule = a.pricing.schedule().await?;
    let Some(quote) =
        quote_standalone(&schedule, a.request_bytes, a.response_bytes, &a.transfer_cc)
    else {
        bail!("give --request-bytes/--response-bytes and/or --transfer-cc");
    };
    if a.json {
        println!("{}", serde_json::to_string_pretty(&quote)?);
        return Ok(());
    }
    let (traffic, amulet) = (quote.traffic, quote.amulet_fee);
    let pricing: &TrafficPricing = &schedule.traffic;
    println!(
        "pricing: {} USD/MB extra traffic, {} USD per CC   [{}]",
        pricing.extra_traffic_price_usd_per_mb.normalize(),
        pricing.amulet_price_usd.normalize(),
        pricing.source
    );
    if let Some(t) = traffic {
        println!(
            "traffic: {} bytes ≈ {} USD ≈ {} CC",
            t.cost.total,
            t.usd.normalize(),
            t.cc.normalize()
        );
    }
    if let Some(f) = amulet {
        println!(
            "amulet transfer: fee {} USD + create {} USD = {} USD ≈ {} CC ({} outputs incl. change)",
            f.transfer_fee_usd.normalize(),
            f.create_fee_usd.normalize(),
            f.total_usd.normalize(),
            f.total_cc.normalize(),
            f.outputs
        );
    }
    Ok(())
}

fn catalog_cmd(a: CatalogArgs) -> Result<()> {
    let entries: Vec<_> = catalog()
        .values()
        .filter(|e| {
            a.filter
                .as_ref()
                .map(|f| e.code.contains(&f.to_ascii_uppercase()))
                .unwrap_or(true)
        })
        .collect();
    if a.json {
        println!("{}", serde_json::to_string_pretty(&entries)?);
        return Ok(());
    }
    for e in entries {
        println!("{:<55} {}", e.code, e.category);
    }
    Ok(())
}

#[allow(dead_code)]
fn _decimal(s: &str) -> Decimal {
    Decimal::from_str(s).expect("decimal")
}
