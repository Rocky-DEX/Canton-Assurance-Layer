//! Splice Scan client: loads the live fee schedule (AmuletRules transfer
//! config + current amulet price) so quotes use network values instead of
//! the Splice reference defaults.

use canton_sim_fee::FeeSchedule;
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("transport error calling {url}: {source}")]
    Transport {
        url: String,
        #[source]
        source: reqwest::Error,
    },
    #[error("{url} returned {status}: {body}")]
    Status {
        url: String,
        status: u16,
        body: String,
    },
    #[error("could not decode {url}: {detail}")]
    Decode { url: String, detail: String },
    #[error(transparent)]
    Fee(#[from] canton_sim_fee::FeeError),
}

/// `base_url` is the Scan root, e.g. `https://scan.sv-1.global.canton.network.sync.global`.
pub async fn fetch_fee_schedule(base_url: &str) -> Result<FeeSchedule, ScanError> {
    let base = base_url.trim().trim_end_matches('/');
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| ScanError::Decode {
            url: base.to_string(),
            detail: e.to_string(),
        })?;
    let rules = get_json(&http, &format!("{base}/api/scan/v0/amulet-rules")).await?;
    let rounds = get_json(
        &http,
        &format!("{base}/api/scan/v0/open-and-issuing-mining-rounds"),
    )
    .await?;
    Ok(FeeSchedule::from_scan_json(
        &rules,
        &rounds,
        &format!("scan:{base}"),
    )?)
}

async fn get_json(http: &reqwest::Client, url: &str) -> Result<Value, ScanError> {
    let resp = http
        .get(url)
        .send()
        .await
        .map_err(|source| ScanError::Transport {
            url: url.to_string(),
            source,
        })?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(ScanError::Status {
            url: url.to_string(),
            status: status.as_u16(),
            body: text.chars().take(300).collect(),
        });
    }
    serde_json::from_str(&text).map_err(|e| ScanError::Decode {
        url: url.to_string(),
        detail: e.to_string(),
    })
}
