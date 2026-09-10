# canton-sim architecture

## The primitive: interactive-submission `prepare`

Canton 3.3+ exposes `InteractiveSubmissionService.PrepareSubmission` (JSON:
`POST /v2/interactive-submission/prepare`). It was built for externally-signed parties:
the participant interprets the command, builds the transaction, and hands back the
serialized `PreparedTransaction` plus its hash for the party to sign. Three properties make
it the right dry-run primitive:

1. **It runs the real pipeline up to sequencing.** Package resolution, Daml interpretation
   (`ensure`, `assert`, exceptions, `failWithStatus`), Daml authorization (signatories /
   controllers vs `actAs`), contract lookup and visibility, and synchronizer routing all
   happen. A rejection here is byte-for-byte the rejection a real submission would get.
2. **It never sequences.** Nothing reaches the synchronizer, no traffic is charged, no
   deduplication state is created. canton-sim uses fresh `canton-sim-…` command ids anyway.
3. **It is not limited to external parties.** `actAs` only needs *read* authorization
   on the token because nothing is executed. Any developer with a read-only token can
   simulate for any party hosted on the participant.

Canton 3.4 adds `estimateTrafficCost` to the request and `costEstimation` to the response:
the confirmation request and response traffic in bytes, computed by the participant against
the chosen synchronizer's traffic parameters. This is the authoritative input for fee
estimation; canton-sim only prices it.

Known limitation: the endpoint currently accepts one command per request. canton-sim
reports that error with a hint (`CreateAndExerciseCommand` / a helper choice).

## Pipeline

```
SimulationRequest
   │  build JsPrepareSubmissionRequest (commandId canton-sim-<uuid>, estimateTrafficCost on)
   ▼
POST /v2/interactive-submission/prepare ─────────────────────────────┐
   │ 2xx                                                             │ 4xx/5xx JsCantonError
   ▼                                                                 ▼
decode base64 PreparedTransaction (prost)                    LedgerError::parse
   │  DamlTransaction{roots,nodes[V1 Create|Exercise|Fetch|Rollback]}   │
   │  Metadata{submitterInfo,synchronizerId,inputContracts,            │  diagnose()
   │           min/max ledger time, maxRecordTime}                      │   ├ phase (request/interpretation/authz/routing/…)
   ▼                                                                    │   ├ catalog entry (explanation, resolution, category)
Effects {nodes tree, counts, informees, input contracts, validity}      │   ├ extracted facts (template, choice, cids, parties,
   │                                                                    │   │  missing authorizers, assertion message, errorId)
   │  costEstimation → quote_traffic (bytes × extraTrafficPrice ÷ amuletPrice)   └ hints
   │  commands → amulet_fee_for (AmuletRules_Transfer / TransferFactory_Transfer)   │
   ▼                                                                    ▼  for CONTRACT_* / LOCAL_VERDICT_* with ids:
SimulationReport{outcome: would_succeed, effects, traffic, amulet_fee}   POST /v2/events/events-by-contract-id
                                                                        ▼
                                                             SimulationReport{outcome: would_fail, diagnosis, contract_states}
```

Transport failures produce `outcome: inconclusive` with the error in `caveats`; the tool
never reports success it has not seen.

## Crates

| Crate | Responsibility | Depends on |
|---|---|---|
| `canton-sim-proto` | prost bindings for the vendored Canton 3.4 protos (`interactive_submission_service`, `commands`, `value`, transitive deps). Compiled with `protox`, no system `protoc`. | prost |
| `canton-sim-diagnose` | `LedgerError` parsing (JSON body, HTTP-wrapped body, gRPC log line), static catalog (`data/canton-error-catalog.json`, 228 codes), `diagnose()` classifier. Pure, sync, no I/O. | serde, regex |
| `canton-sim-fee` | `TrafficCost` → `TrafficQuote`; Splice `TransferConfigUSD` model (`AmuletFeeSchedule`) and step-function transfer fee; `FeeSchedule::from_scan_json`. `Decimal` only. | rust_decimal |
| `canton-sim-core` | `LedgerApi` trait + reqwest `JsonLedgerClient`; `prepared::effects_of`; `Simulator`; text renderer; Scan client. | all of the above |
| `canton-sim` (cli) | `simulate`, `explain`, `contract`, `effects`, `fee`, `catalog`. | core |
| `canton-sim-server` | axum: `POST /v1/simulate` (JSON or `Accept: text/plain`), `POST /v1/explain`, `GET /v1/catalog[/{code}]`, `GET /v1/fee-schedule`, `GET /healthz`. Forwards the caller's bearer token when present. | core |

## Error catalog provenance

`data/canton-error-catalog.json` is generated (see [`error-catalog.md`](error-catalog.md)):

- 202 codes from `@Explanation`/`@Resolution` annotations in Canton `release-line-3.4`
  sources (`CommandExecutionErrors`, `ConsistencyErrors`, `RequestValidationErrors`,
  `LocalRejectError`, `TransactionProcessor`, `SyncServiceError`, `SequencerDeliverError`,
  `CommonErrors`, `LedgerApiErrors`, `TopologyManagerError`, admin/user/party errors).
- 21 codes from the Daml 2.10 error reference whose definitions have not moved.
- 7 hand-written routing/authorization entries (`NO_SYNCHRONIZER_FOR_SUBMISSION`,
  `UNKNOWN_INFORMEES`, `PERMISSION_DENIED`, …) marked `source = "manual"`; these should be
  re-validated against a live participant during milestone 2.

The classifier does not depend on the catalog being complete: unknown codes still get a
phase (by prefix), the first sentence of the cause, and the generic hints.

## Fee model

Two components, both `Decimal`:

- **Traffic.** `usd = total_bytes / 1e6 × extraTrafficPrice(USD/MB)`; `cc = usd ÷ amuletPrice`.
  Both prices come from Scan (`/api/scan/v0/amulet-rules` → `transferConfig.extraTrafficPrice`,
  `/api/scan/v0/open-and-issuing-mining-rounds` → newest `amuletPrice`). The quote is an
  upper bound: the participant's free base-rate allowance is not modelled (it depends on the
  node's recent activity).
- **Amulet transfers.** Splice `TransferConfigUSD`: create fee per output, step-function
  transfer fee on outputs to other parties (`initialRate` up to the first step, then each
  step's rate up to the next threshold), lock-holder fee per holder. Applied when the command
  is `AmuletRules_Transfer` or a token-standard `TransferFactory_Transfer` with instrument
  `Amulet`.

Defaults (`FeeSchedule::splice_defaults`) are Splice reference values, labelled
`splice-defaults` in every report so nobody mistakes them for network values.

## Security

- canton-sim never holds signing keys and never calls `execute`/`submit`. The worst case
  of a bug is a wrong report.
- Tokens are read per request (rotated token files are picked up) and never logged.
- The server forwards a caller-supplied bearer token to the participant unchanged; deploy it
  behind the same access control as the participant's JSON API, or run it with
  `--forward-auth=false` and a read-only server token.
- Reports include contract arguments; treat them with the same confidentiality as the ledger.

## Testing

- Unit tests per crate (parsing, classification, fee arithmetic, value → JSON, effects walk).
- Integration tests spin up an axum mock of `/v2/interactive-submission/prepare` and
  `/v2/events/events-by-contract-id` and exercise the whole `Simulator` on success,
  rejection-with-lookup, assertion failure and unreachable-participant paths.
- Live tests (milestone 2): run the `fixtures/simulator/perp-custody` set against a LocalNet
  validator and against DevNet; compare traffic estimates with `traffic_control.traffic_state`
  deltas to calibrate.
