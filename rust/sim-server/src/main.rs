//! Binary entry point; see `lib.rs` for the router.

use canton_sim_core::{JsonLedgerClient, TokenSource};
use canton_sim_fee::FeeSchedule;
use canton_sim_server::{AppState, Config, app};
use clap::Parser;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();
    let cfg = Config::parse();
    let schedule = match &cfg.scan {
        Some(url) => {
            let s = canton_sim_core::scan::fetch_fee_schedule(url).await?;
            tracing::info!(source = %s.traffic.source, "loaded fee schedule from Scan");
            s
        }
        None => {
            tracing::warn!(
                "no --scan given; using Splice reference fee defaults (not network values)"
            );
            FeeSchedule::splice_defaults()
        }
    };
    // Fail fast on a bad ledger URL.
    JsonLedgerClient::new(&cfg.ledger, TokenSource::None)?;

    let state = AppState {
        cfg: cfg.clone(),
        schedule,
    };
    let app = app(state);
    let listener = tokio::net::TcpListener::bind(&cfg.listen).await?;
    tracing::info!(listen = %cfg.listen, ledger = %cfg.ledger, "canton-sim-server started");
    axum::serve(listener, app).await?;
    Ok(())
}
