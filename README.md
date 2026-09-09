<p align="center"><b>canton-sim</b></p>
<h3 align="center">Pre-submit simulation, failure explanation and fee estimation for Canton transactions</h3>

<p align="center">
  <code>canton-sim simulate</code> answers three questions before a command is submitted:<br/>
  <b>What will this transaction do?</b> · <b>Why would it be rejected?</b> · <b>What will it cost?</b>
</p>

---

## Why

Canton developers get rejections like `UNHANDLED_EXCEPTION` or `DAML_AUTHORIZATION_ERROR`
back from `submit-and-wait` with a raw `cause` string, and only after traffic has been
spent. There is no equivalent of Tenderly's "simulate this transaction" for Canton:
nothing shows the creates/archives a command would produce, no tool turns the error into
a next step, and traffic and Canton Coin fees are invisible until the wallet balance moves.

canton-sim closes that gap using a primitive Canton already ships: the Ledger API's
interactive-submission **prepare** step. `prepare` runs full Daml interpretation and
authorization on the participant, returns the exact transaction that *would* be committed
together with a traffic cost estimate, and never sequences anything. canton-sim wraps it,
decodes the result into human-readable ledger effects, prices it, and — when the
participant rejects the command — explains the rejection with the same error the real
submission would have produced.

```
$ canton-sim simulate --ledger https://validator.example/api/json-api \
    --token-file token.jwt --act-as 'exchange::1220…' fixtures/perp-custody/platform-account-debit.json

canton-sim — WOULD SUCCEED
participant: https://validator.example/api/json-api/v2   commandId: canton-sim-9f1b…   214 ms
actAs: exchange::1220…

Effects: 1 create, 1 exercise (1 consuming), 0 fetch, 0 rollback   on global-synchronizer::1220…
  Exercise PerpCustody:PlatformAccount.Debit on 00a1b2c3d4…f0e1   by exchange::1220…   [consuming]
    arg: {"delta":"25.0","chain_tx_id":"canton-sim-dry-run"}
    Create PerpCustody:PlatformAccount → 00c4d5e6f7…a2b3   signatories: exchange::1220…
Informees: exchange::1220…
Input contracts: 1 (1 consumed)
Prepared transaction: 1,912 bytes, hash 3f4deaf145a15cdc…, HASHING_SCHEME_VERSION_V2

Traffic: 4,512 bytes (request 4,212 + response 300) ≈ 0.27 USD ≈ 54 CC   [pricing: scan:https://scan…]

Caveats:
  - prepare covers Daml interpretation and authorization on this participant; contention on input
    contracts, package vetting on counterparties' participants and sequencer-time checks are only
    verified at confirmation.
```

And when the same command would fail:

```
canton-sim — WOULD FAIL at Daml interpretation
UNHANDLED_EXCEPTION — Daml AssertionFailed: "Insufficient balance"
  An `assert`/`assertMsg` in the choice body evaluated to False with message "Insufficient balance".
  The transaction would be rejected before reaching the sequencer; nothing is charged.
  template a1b2c3d4…:PerpCustody:PlatformAccount · choice Debit · contracts 00a1b2…
  contract state: 00a1b2c3d4…f0e1 ACTIVE (a1b2c3d4…:PerpCustody:PlatformAccount)
  Canton: This error occurs when a user throws an error and does not catch it with try-catch.
  Next steps:
   - Contract 00a1b2c3d4…f0e1 is ACTIVE and visible to the acting parties, so the failure is not
     about its existence; check authorization and the choice arguments.
   - Read the assertion message: it names the business rule that rejected the input …
  retryable: no   category: InvalidGivenCurrentSystemStateOther   http: 400   correlationId: 9f1c2d
```

## What it does

| Capability | How |
|---|---|
| **Pre-submit simulation** | `POST /v2/interactive-submission/prepare` with `estimateTrafficCost` enabled. Works for any party the token can *read* as — no signing keys needed. Nothing is submitted. |
| **Ledger-effects preview** | Decodes the returned `PreparedTransaction` protobuf: every create / consuming or non-consuming exercise / fetch / rollback, with template, choice, arguments, signatories, stakeholders, informees, input contracts and validity window. |
| **Failure explanation** | Parses the `JsCantonError` (or a gRPC-style log line), classifies the phase (request · interpretation · Daml authorization · routing · sequencing · confirmation · participant), extracts the assertion message / missing authorizers / template / contract ids, attaches Canton's own explanation & resolution from a 228-code catalog, and adds concrete next steps. On contract errors it looks the contract up to say *archived at offset N* vs *never seen by this participant*. |
| **Fee estimation** | Prices the participant's traffic estimate in USD and CC using the live `AmuletRules.extraTrafficPrice` and `amuletPrice` from Scan; quotes Splice transfer/create/lock-holder fees when the command is a Canton Coin transfer. All arithmetic is `Decimal`. |
| **Three surfaces** | `canton-sim` CLI (text or `--json`, `--fail-on-reject` for CI), `canton-sim-server` HTTP API (`POST /v1/simulate`, `/v1/explain`, `/v1/catalog`), and Rust crates for embedding in wallets, bots and DPM tooling. |

### Not in scope (and why)

- **Post-hoc trace replay / visualisation of committed transactions.** That is the
  DPM trace-visualisation work proposed by Walnut. canton-sim is strictly *pre-submit*;
  its output is the prepared transaction, not the update stream. The two are complementary:
  canton-sim → "will it work and what will it cost", Walnut → "what happened".
- **Confirmation-time outcomes.** `prepare` cannot see contention on input contracts,
  package vetting on counterparties' participants or sequencer timing. The report says so
  in its caveats instead of pretending.

## Install

```bash
cargo install --path cli/canton-sim            # CLI
cargo install --path server/canton-sim-server  # HTTP service
# or
docker build -t canton-sim .
```

Requires Rust 1.88+. No `protoc`: the vendored Canton 3.4 Ledger API protos are compiled
with `protox`.

## Usage

```bash
export CANTON_SIM_LEDGER_URL=https://validator.example/api/json-api   # JSON Ledger API (…/v2 optional)
export CANTON_SIM_TOKEN_FILE=./token.jwt                              # read rights on the actAs parties suffice
export CANTON_SIM_SCAN_URL=https://scan.sv-1.global.canton.network.sync.global   # optional, live fee schedule

# simulate a command (JSON Ledger API Command object, an array, or a full request object)
canton-sim simulate --act-as 'alice::1220…' fixtures/perp-custody/platform-account-debit.json
canton-sim simulate --act-as 'alice::1220…' --json - < cmd.json | jq .outcome
canton-sim simulate --act-as 'alice::1220…' --fail-on-reject cmd.json   # exit 2 on WOULD FAIL → CI gate

# explain an error you already have (code, JSON body, or the log line your client printed)
canton-sim explain 'JSON Ledger API POST … returned 400 Bad Request: {"code":"UNHANDLED_EXCEPTION", …}'
canton-sim explain DAML_AUTHORIZATION_ERROR

# is this contract active, archived, or unknown here?
canton-sim contract 00a1b2… --party 'alice::1220…'

# decode a prepare response / prepared transaction offline (wallets: show users what they sign)
canton-sim effects prepare-response.json

# price things without a participant
canton-sim fee --request-bytes 4200 --response-bytes 300 --transfer-cc 10000
canton-sim catalog --filter VERDICT
```

Server:

```bash
canton-sim-server --ledger $CANTON_SIM_LEDGER_URL --token-file token.jwt --scan $CANTON_SIM_SCAN_URL
curl -s localhost:8787/v1/simulate -H 'content-type: application/json' \
  -d '{"act_as":["alice::1220…"],"commands":[{"ExerciseCommand":{…}}]}' | jq .
curl -s localhost:8787/v1/simulate -H 'accept: text/plain' -d @fixtures/perp-custody/request-full.json
curl -s localhost:8787/v1/explain -d '{"error":"CONTRACT_NOT_FOUND"}'
```

Callers may pass their own `Authorization: Bearer …`; it is forwarded to the participant
so the simulation runs with the caller's rights.

## Repository layout

```
crates/canton-sim-proto      vendored Canton 3.4 Ledger API protos → prost types (interactive submission, values)
crates/canton-sim-diagnose   error catalog (data/canton-error-catalog.json), JsCantonError parsing, classifier
crates/canton-sim-fee        traffic pricing (bytes → USD → CC) and Splice Amulet fee model; Scan JSON loader
crates/canton-sim-core       LedgerApi client, PreparedTransaction → Effects, Simulator orchestration, text renderer
cli/canton-sim               the CLI
server/canton-sim-server     axum HTTP service
fixtures/perp-custody        command fixtures against Rocky's custody package
docs/                        proposal, architecture, error catalog, fee model
```

See [docs/design/architecture.md](docs/design/architecture.md) for the pipeline and
[docs/proposal/rfp-20-transaction-dry-run.md](docs/proposal/rfp-20-transaction-dry-run.md)
for the Canton Foundation grant proposal this project is built for.

## Development

```bash
cargo test --all
cargo clippy --all-targets -- -D warnings
cargo fmt --all
```

Integration tests run against an in-process mock of the JSON Ledger API (`crates/canton-sim-core/tests`),
so the suite needs no Canton node. Testing against a real participant: point
`CANTON_SIM_LEDGER_URL` at a LocalNet or DevNet validator's JSON API and run the fixtures.

## Status

Milestone 1 (this repository): CLI + HTTP service + crates, prepare-based simulation, effects
decoding, 228-code error catalog with cause parsing, traffic/fee pricing, mock-tested.
Next: live validation on DevNet/MainNet validators, a web UI for the effects tree, and
calibration of the traffic estimate against actual sequencer charges. See the proposal for
the milestone plan.

## License

Apache-2.0.
