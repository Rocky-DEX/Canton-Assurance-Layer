## Development Fund Proposal

**Organization:** Rocky DEX
**Author / Primary Contact:** _(name, GitHub handle, email)_
**Status:** Draft
**Created:** 2026-09-09
**Proposal Type:** RFP-aligned
**RFP / Roadmap Area:** Developer Experience, Tooling & Education — RFP 19 "DPM Components and Extension Ecosystem" (fee estimators); supports RFP 20 note on transaction dry-run tooling
**Champion:** `Needs Champion`
**Total Funding Request:** 360,000 CC
**Project Duration:** 4 months
**Label:** daml-tooling

---

## Abstract

`dpm fee` tells a Canton developer what a transaction will cost before it is submitted. It
runs the participant's own interactive-submission `prepare` step with traffic-cost
estimation enabled (Canton 3.4), prices the returned confirmation-request and
confirmation-response bytes in USD and Canton Coin using the live `AmuletRules`
extra-traffic price and the current round's amulet price from Scan, and — when the command
moves Canton Coin — quotes the Splice transfer, create and lock-holder fees. It needs only
read rights, never submits, and keeps all data on the operator's node. It ships as an
open-source DPM component, a CLI, an HTTP endpoint for wallets, bots and CI, and Rust
crates. A working, tested implementation is delivered with this proposal; the grant funds
live calibration against real sequencer charges, DPM packaging, a TypeScript client and
adoption by at least three independent organisations.

---

## Specification

### 1. Objective

Canton charges for synchronizer traffic in bytes and for Canton Coin movements through a
step-function fee schedule. Neither is visible to a developer, an operator or an end user
before submission: traffic shows up as a balance change on the validator, transfer fees as
a smaller-than-expected receipt. RFP 19 lists "fee estimators" as a wanted DPM component
with no prior grant. No approved or pending Development Fund proposal covers cost
estimation.

Outcome: one command or API call returns, for a given Ledger API command and acting party,
the estimated traffic in bytes, its price in USD and CC, and any Canton Coin fees — with the
pricing source and its caveats stated — so that wallets can show cost before signing,
services can budget traffic top-ups, and CI can flag commands whose cost regressed.

Single objective: cost estimation. Failure explanation is a separate proposal
(`2026-09-Rocky-dpm-explain-failure-explanation.md`); transaction visualisation is Walnut's
approved `dpm trace` (#327).

### 2. Implementation Mechanics

**Traffic estimate.** `POST /v2/interactive-submission/prepare` with
`estimateTrafficCost` enabled. Canton 3.4 returns `costEstimation`
(`confirmationRequestTrafficCostEstimation`, `confirmationResponseTrafficCostEstimation`,
total), computed by the participant against the synchronizer that would carry the
transaction, including signature sizes when `expectedSignatures` is given. `prepare`
interprets and authorizes the command on the participant and stops before sequencing:
nothing is charged, no deduplication state is created, and `actAs` needs only read rights.

**Pricing.** `usd = bytes / 1e6 × extraTrafficPrice`, `cc = usd / amuletPrice`.
`extraTrafficPrice` (USD per MB) is read from `AmuletRules.transferConfig` via Scan
`/api/scan/v0/amulet-rules`; `amuletPrice` from the newest open mining round via
`/api/scan/v0/open-and-issuing-mining-rounds`. The quote is labelled an upper bound: the
participant's free base-rate allowance depends on its recent activity and is reported, not
modelled, in Milestone 2.

**Canton Coin fees.** Commands exercising `AmuletRules_Transfer` or a token-standard
`TransferFactory_Transfer` with instrument `Amulet` are priced with Splice's
`TransferConfigUSD`: the step-function transfer fee on outputs to other parties
(`initialRate` up to the first threshold, each step's rate to the next), the create fee per
output including the sender's change output, and the lock-holder fee per holder. All
arithmetic uses fixed-point decimals; Splice reference values are used only when Scan is
unavailable and are labelled `splice-defaults` in every quote.

**Surfaces.** `canton-sim fee` / `canton-sim simulate` (text and `--json`);
`canton-sim-server` (`POST /v1/simulate`, `GET /v1/fee-schedule`; forwards the caller's
bearer token); Rust crates `canton-sim-fee` and `canton-sim-core`. Milestone 3 packages the
CLI as a DPM component (`component.yaml`, OCI publish) exposing `dpm fee` and publishes a
TypeScript client for the HTTP API so wallets and dApps can call it without Rust.

**Interoperability.** Input accepts the same command payload shape as Walnut's
`dpm trace prepare --commands commands.json`, and can price an exported `prepared.json`
directly, so the two components compose in one workflow.

**Data and privacy (RFP 20 questions).** All inputs are node-local (`prepare` response of
the operator's own participant) or public configuration (Scan). No ACS, payload or party
data leaves the node; the HTTP service is deployed beside the participant. Nothing depends
on mediator metadata or publicly observable protocol messages.

**Delivered code.** `github.com/Rocky-DEX/Canton-Assurance-Layer`, crates `rust/sim-*` — Rust 1.88 workspace; prost
bindings compiled from vendored Canton 3.4 protos with `protox` (no `protoc`); 31 unit and
integration tests including an in-process mock of the JSON Ledger API; CI with clippy
`-D warnings`; Apache-2.0.

### 3. Architectural Alignment

- Uses Canton's own `prepare` cost estimation and Splice's published configuration; no
  re-implementation of Daml, traffic accounting or fee logic.
- Extends what exists: composes with Walnut's approved `dpm trace` payloads and follows
  RFP 19 DPM component conventions rather than introducing a new toolchain.
- Serves the roadmap priorities "simplified traffic accounting and application rewards"
  and "reduced developer friction", and RFP 20's preference for tools that keep working as
  privacy protections evolve.
- Governance references: CIP-0082 / CIP-0100 (fund), Splice `AmuletRules` (fee schedule).

### 4. Backward Compatibility

No backward compatibility impact. Read-only against existing APIs; participants below
Canton 3.4 return no `costEstimation`, in which case the tool reports the traffic as
unknown rather than guessing.

---

## Milestones and Deliverables

### Milestone 1: Fee estimator core (delivered)
- **Estimated Delivery:** delivered with this proposal
- **Focus:** prepare-based traffic estimate, Scan pricing loader, Splice transfer-fee
  model, CLI, HTTP endpoint, crates, tests, CI.
- **Deliverables / Value Metrics:** public Apache-2.0 repository with green CI; at least
  one external team runs `canton-sim fee` against DevNet and confirms the quote matched
  the pricing they observe (gathered during review).

### Milestone 2: Live calibration and error bound
- **Estimated Delivery:** 6 weeks after proposal acceptance
- **Focus:** run the estimator against LocalNet, DevNet and a MainNet validator for a
  representative command set (creates, single and multi-party exercises, Amulet transfers,
  externally-signed submissions); compare estimates with actual sequencer charges from
  `traffic_control.traffic_state` deltas; model or report the base-rate allowance; verify
  the Scan configuration parsing on each network; host a public DevNet endpoint.
- **Deliverables / Value Metrics:** published calibration report with methodology;
  estimate within the published bound on ≥ 95 % of sampled transactions; hosted DevNet
  endpoint used by ≥ 2 external teams (verifiable by request logs and written feedback).

### Milestone 3: DPM component, TypeScript client, wallet integration
- **Estimated Delivery:** 6 weeks after Milestone 2
- **Focus:** `dpm fee` packaged per DPM component conventions with docs and examples;
  TypeScript client on npm; reference integration showing cost before signing in a wallet
  or dApp; CI example that fails when a fixture's cost regresses beyond a threshold.
- **Deliverables / Value Metrics:** component installable through `dpm`; **≥ 3
  independent organisations (target profile: a wallet team, a validator or node operator,
  a DPM app team) use `dpm fee` or the API in development, CI or production and confirm in
  writing that it gave them cost visibility they did not have**.

### Milestone 4: Adoption report and handover
- **Estimated Delivery:** 4 weeks after Milestone 3
- **Focus:** docs in the Foundation documentation format; maintenance plan and named
  owner; adoption report with usage counts from the hosted endpoint and named
  organisations; contribution guide.
- **Deliverables / Value Metrics:** adoption report accepted by the committee; maintenance
  owner named; DevRel invited to re-ask the traffic/cost question in the next survey.

---

## Acceptance Criteria

The Tech & Ops Committee will evaluate completion based on:

- Deliverables completed as specified for each milestone
- Demonstrated functionality or operational readiness
- Documentation and knowledge transfer provided
- Alignment with stated value metrics

Project-specific conditions:

- Milestone 2: calibration report with the measured error bound and the ≥ 95 % figure,
  reproducible from the published command set.
- Milestone 3: written confirmation from ≥ 3 independent organisations of use.
- The tool never submits, signs or holds keys; every quote carries its pricing source and
  the caveats on what `prepare` cannot observe.

---

## Funding

**Total Funding Request:** 360,000 CC

### Payment Breakdown by Milestone
- Milestone 1 _(Fee estimator core, delivered)_: 80,000 CC upon committee acceptance
- Milestone 2 _(Live calibration and error bound)_: 120,000 CC upon committee acceptance
- Milestone 3 _(DPM component, TS client, wallet integration)_: 100,000 CC upon committee acceptance of the three-organisation adoption criterion
- Milestone 4 _(Adoption report and handover)_: 60,000 CC upon final release and acceptance

Adoption-gated share (M3 + M4): 160,000 CC, 44 % of the total.

### Volatility Stipulation
Project duration is **under 6 months** (4 months). Should the project timeline extend beyond
6 months due to Committee-requested scope changes, any remaining milestones must be
renegotiated to account for significant USD/CC price volatility.

---

## Co-Marketing
Upon release, the implementing entity will collaborate with the Foundation on:

- Announcement coordination
- Case study or technical blog: "What a Canton transaction costs, before you send it"
- Developer or ecosystem promotion; a joint demo with Walnut's `dpm trace` if both teams agree

---

## Motivation

The Canton Foundation DevRel survey cited in the roadmap's RFP 20 note rated Transaction
Debugging & Observability lowest in Q1 (2.55) and tied-lowest in Q2 (3.26); cost
visibility is the part of that gap no funded work addresses. RFP 19 names fee estimators
explicitly with no prior grant, and the review guidance lists simplified traffic accounting
as an app-building priority.

Who benefits: every party that pays for traffic or moves Canton Coin — validator operators
sizing top-ups, wallets showing cost before a signature, exchanges and market makers
pre-flighting settlement batches (Rocky runs these in production and has hit
`SEQUENCER_NOT_ENOUGH_TRAFFIC_CREDIT` under load), DPM app teams budgeting in CI. Most
Featured App teams submit through their own services rather than a UI; a key-less API call
fits that path directly. We estimate more than half of active app teams would use a cost
pre-flight once it is one `dpm` install away.

---

## Rationale

**Why the participant's estimate.** Canton 3.4 computes traffic cost inside the node that
would pay it, against the real synchronizer parameters. Any external model would
re-implement that and drift per release. The component's value is in pricing, Canton Coin
fee modelling, live configuration, packaging and calibration — not in re-deriving bytes.

**Why not part of a simulator.** Tenderly's proposal (#481) and Walnut's `dpm trace`
(#327) both concern what a transaction does; neither prices it. A small, single-purpose
component can be consumed by both and by wallets, which a bundled platform cannot. This
follows the template's single-objective guidance.

**Why extend rather than replace.** The component accepts Walnut's command and
prepared-transaction payloads and follows DPM component conventions, so it slots into the
existing `dpm` workflow instead of adding a parallel one.

**Alternatives considered.** A hosted pricing service — rejected, data and keys should stay
with the operator; a static fee table — rejected, prices change per round and per
governance vote and must be read live.
