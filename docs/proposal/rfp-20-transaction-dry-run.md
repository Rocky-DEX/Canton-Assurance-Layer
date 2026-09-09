## Development Fund Proposal

**Organization:** Rocky DEX (Rocky-DEX on GitHub)
**Author / Primary Contact:** _(fill in)_
**Status:** Draft
**Created:** 2026-09-09
**Proposal Type:** RFP-aligned
**RFP / Roadmap Area:** Developer Experience, Tooling & Education — RFP 19 (DPM Components: "fee estimators", "debugging workflows", "observability tools") and RFP 20 (Indexers & observability: "debugging tools"; DevRel survey note on transaction simulation / dry-run)
**Champion:** `Needs Champion` — candidates: "Daml Language & Developer Tooling" SIG (see `sig-directory.md`); Foundation DevRel (owner of the survey cited in RFP 20)
**Total Funding Request:** _(fill in — see Funding; comparable approved/pending proposals: #297 450k CC for a failure-classification engine, #327 1.9M CC, #481 1.875M CC)_
**Project Duration:** 5 months (under the 6-month volatility threshold)
**Label:** daml-tooling

> **Drafting note (remove before submission).** This draft follows `proposals/_template.md`
> verbatim. Read `landscape-2026-09.md` first: Tenderly (#481, ready for vote) and Walnut
> (#327, approved, includes `dpm trace prepare`) already occupy "simulate before submit".
> This proposal is therefore scoped to the two things nobody covers — **fee/traffic
> estimation** and an **open failure-explanation engine** — delivered as DPM components
> that consume Walnut's prepared-transaction / completion payloads. The template's
> single-objective rule and the internal roadmap's note (guideline §14.2) suggest
> submitting these as **two proposals**; this file keeps both so the split can be made once
> a Champion has weighed in. Submission path:
> `rfps/developer-experience-tooling-education/2026-09-Rocky-canton-sim-preflight.md`.

---

## Abstract

canton-sim gives Canton developers a pre-flight check for a Ledger API command before it is
submitted: **what it will cost** (synchronizer traffic priced in Canton Coin, plus Splice
transfer fees for CC movements) and, if the participant rejects it, **why in structured,
actionable terms** (phase, Canton error code with the Foundation's own explanation and
resolution, the assertion message / missing authorizers / template / choice / contract ids,
whether the contract is archived or unknown, concrete next steps). Both are built on the
participant's own interactive-submission `prepare` step, need only read rights, never submit
anything, and are delivered as open-source `dpm` components (`dpm fee`, `dpm explain`) plus
an embeddable HTTP service and Rust crates for CI gates, trading bots and wallets. The
error catalog (228 codes, regenerated from Canton sources per release) and the diagnosis
JSON are published as public goods for `dpm trace`, DPM Debug and other tooling to consume.
Milestone 1 is delivered as working, tested code with this proposal.

---

## Specification

### 1. Objective

Close two gaps that remain after the Foundation's approved and pending debugging proposals:

1. **Nobody can estimate what a Canton transaction costs before submitting it.** Traffic is
   charged in bytes that developers cannot predict; Canton Coin transfer fees are a step
   function discovered from the wallet balance. RFP 19 asks for "fee estimators" and lists
   no prior grants; the review guidance lists "simplified traffic accounting" as a priority.
2. **A rejection is still a raw `cause` string.** Walnut's `dpm trace` shows completion
   status and error details; Tenderly's failure analysis is inside a commercial dashboard;
   the open failure-classification engine (#297) was closed for portfolio reasons. There is
   no open, versioned catalog of Canton error codes with explanation, resolution and a stable
   diagnosis schema that tooling can consume.

Intended outcome: a developer (or a CI job, a bot, a wallet) runs one pre-flight call and
learns *would this be accepted, why not, what would it cost* — from the participant's own
interpretation, with no keys and no submission.

Out of scope (owned by others or deliberately excluded): transaction tree visualisation and
prepared-vs-committed diffs (Walnut #327); off-participant re-execution on a hydrated ACS
(Tenderly #481); node-local forensic querying (Daml Shell #752); confirmation-time outcomes
(contention, counterparties' vetting), which `prepare` cannot observe and which every report
states as caveats.

### 2. Implementation Mechanics

**Primitive.** `POST /v2/interactive-submission/prepare` (Canton 3.3+) runs package
resolution, Daml interpretation, Daml authorization, contract visibility and synchronizer
routing on the participant and stops before sequencing. A rejection is byte-for-byte the
one a real submission would receive; a success returns the exact `PreparedTransaction`
and — in Canton 3.4 — a `costEstimation` (confirmation request + response traffic in bytes)
computed by the node that would pay it. `actAs` requires only *read* rights on the token.
Nothing is charged, no deduplication state is created.

**Pipeline (implemented, `crates/canton-sim-core`).**

```
command JSON ─▶ prepare (estimateTrafficCost on) ─┬─▶ ok:  decode PreparedTransaction (prost) ─▶ effects, informees, input contracts, validity window
                                                   │        costEstimation ─▶ TrafficQuote (bytes × extraTrafficPrice ÷ amuletPrice, from Scan)
                                                   │        Amulet transfer detected ─▶ Splice TransferConfigUSD fee quote
                                                   └─▶ err: JsCantonError ─▶ Diagnosis (phase, catalog entry, extracted facts, hints)
                                                            CONTRACT_* / LOCAL_VERDICT_* ─▶ /v2/events/events-by-contract-id ─▶ active | archived@offset | unknown
```

**`dpm fee` (fee estimation).** Input: a command payload (the same `commands.json` shape
Walnut's `dpm trace prepare` takes) or an exported `prepared.json`. Output: traffic bytes
split into confirmation request / response, priced in USD and CC using
`AmuletRules.transferConfig.extraTrafficPrice` and the newest open round's `amuletPrice`
loaded from Scan (`/api/scan/v0/amulet-rules`, `/api/scan/v0/open-and-issuing-mining-rounds`);
for `AmuletRules_Transfer` / token-standard `TransferFactory_Transfer` of Amulet, the
Splice transfer fee (step function), create fee per output and lock-holder fee. All
arithmetic in `Decimal`; pricing source labelled in every quote; `expectedSignatures`
passed through so external-party signature sizes are included. Milestone 2 calibrates
estimates against actual sequencer charges (`traffic_control.traffic_state` deltas) and
publishes the error bound.

**`dpm explain` (failure explanation).** Input: a `JsCantonError` body, an HTTP-client
wrapped body, a gRPC-style log line, or a completion payload. Output: `Diagnosis` JSON —
`code`, `phase` (auth · request · interpretation · Daml authorization · routing ·
sequencing · confirmation · participant), catalog `explanation` / `resolution`, `extracted`
(template, choice, contract ids, required/given/missing authorizers, exception type and
message, `failWithStatus` errorId, package, synchronizer), `hints`, `retryable`,
`definite_answer`, `contract_states`. The catalog (`canton-error-catalog.json`) is generated
by a script from the `@Explanation` / `@Resolution` annotations in Canton's sources (202
codes from `release-line-3.4`), with provenance per entry; regeneration per Canton release
is an acceptance criterion. Milestone 2 adds a labelled rejection corpus (fault-injected on
LocalNet plus production rejections from Rocky's exchange) and reports precision per error
family, following the bar set in #297's review.

**Surfaces.** `canton-sim` CLI (`simulate`, `explain`, `contract`, `effects`, `fee`,
`catalog`; `--json`; `--fail-on-reject` exit code for CI); `canton-sim-server` (axum;
`POST /v1/simulate`, `POST /v1/explain`, `GET /v1/catalog`, `GET /v1/fee-schedule`;
forwards the caller's bearer token so simulations run with the caller's rights); Rust
crates; DPM component packaging (`component.yaml`, OCI publish) in Milestone 3; TypeScript
client for the HTTP API in Milestone 3.

**Data and privacy (RFP 20 questions).** All data is node-local: the participant's own
`prepare` response, its own event lookup, and public Scan configuration. No ACS or payload
leaves the operator's environment; the server is deployed next to the participant. No
dependence on mediator metadata or publicly observable protocol messages; the tool keeps
working if involved-party metadata is withdrawn from public view. Access control is the
participant's: whatever the token may read, the tool may simulate.

**Technology.** Rust 1.88, prost bindings compiled from vendored Canton 3.4 protos with
`protox` (no `protoc`), reqwest, axum, `rust_decimal`. 31 unit and integration tests
including an in-process mock of the JSON Ledger API. Apache-2.0.

### 3. Architectural Alignment

- Uses Canton's own interactive-submission and event APIs; no re-implementation of Daml or
  of authorization; no protocol changes.
- Extends what exists: consumes and produces the `commands.json` / `prepared.json` /
  completion shapes used by Walnut's approved `dpm trace` (#327), and is packaged as `dpm`
  components per RFP 19 conventions. The effects decoder is offered to Walnut as shared
  code; the diagnosis JSON is the "integration contract" #297's reviewers asked for.
- Aligns with roadmap priorities "reduced developer friction", "simplified traffic
  accounting", and RFP 20's preference for tools that do not rely on unintended metadata
  exposure.
- Relevant CIPs: CIP-0082 / CIP-0100 (fund governance); Splice AmuletRules configuration
  (fee schedule source).

### 4. Backward Compatibility

No backward compatibility impact. The tool is read-only against existing APIs. Catalog
regeneration tolerates codes appearing or disappearing between Canton releases (unknown
codes still receive a phase and generic guidance).

---

## Milestones and Deliverables

### Milestone 1: Core pre-flight tool (delivered with this proposal)
- **Estimated Delivery:** delivered — `github.com/Rocky-DEX/Rocky.simulator`
- **Focus:** prepare-based simulation, effects decoding, 228-code catalog with cause
  parsing and hints, traffic and Amulet fee pricing with Scan loader, CLI + HTTP service,
  mock-tested CI.
- **Deliverables / Value Metrics:** public Apache-2.0 repository; `cargo test --all` and
  clippy `-D warnings` green in CI; fixtures for Rocky's custody package documented.
  _(Value metric for acceptance: at least one external team reproduces a real rejection
  with `canton-sim explain` and confirms the diagnosis was actionable — to be gathered
  during review.)_

### Milestone 2: Live validation, calibration and corpus
- **Estimated Delivery:** 6 weeks after acceptance of the proposal
- **Focus:** run the fixture set and Rocky's production settlement/custody commands against
  LocalNet, DevNet and a MainNet validator; verify every `manual` catalog entry; build the
  labelled rejection corpus (fault injection on LocalNet + Rocky production rejections);
  calibrate traffic estimates against sequencer charges; host a DevNet `canton-sim-server`.
- **Deliverables / Value Metrics:** validation report; **≥ 90 % of rejection codes in the
  corpus classified with a specific (non-generic) explanation, precision ≥ 90 % on emitted
  diagnoses**; **traffic estimate within a published bound on ≥ 95 % of sampled
  transactions**; hosted DevNet endpoint used by ≥ 2 external teams.

### Milestone 3: DPM components, TypeScript client, integrations
- **Estimated Delivery:** 8 weeks after Milestone 2
- **Focus:** `dpm fee` and `dpm explain` packaged as DPM components (component.yaml, OCI
  publish, docs, examples); TypeScript client for the HTTP API; adapters so `dpm trace`
  and DPM Debug can call `explain` on a completion; wallet integration example (show cost
  and effects before signing).
- **Deliverables / Value Metrics:** components installable via `dpm`; **≥ 3 independent
  organisations (target profile: a wallet team, a validator/node operator, a DPM app team)
  use `dpm fee` or `dpm explain` in development or CI and confirm in writing that it
  shortened debugging or prevented a failed submission**.

### Milestone 4: Adoption, catalog regeneration, handover
- **Estimated Delivery:** 4 weeks after Milestone 3
- **Focus:** catalog regenerated by the script alone for the next Canton minor release;
  docs in the Foundation docs format; contribution guide for catalog hints; maintenance
  plan; adoption report.
- **Deliverables / Value Metrics:** regenerated catalog merged for a new Canton release
  without manual edits; adoption report with usage counts from the hosted endpoint and
  named organisations; DevRel survey question on transaction debugging re-asked in the
  following quarter (target: score improves from the Q2 3.26 baseline).

---

## Acceptance Criteria

The Tech & Ops Committee will evaluate completion based on:

- Deliverables completed as specified for each milestone
- Demonstrated functionality or operational readiness
- Documentation and knowledge transfer provided
- Alignment with stated value metrics

Project-specific conditions:

- Milestone 2: published precision/coverage figures on a frozen, labelled corpus; published
  traffic-estimate error bound with methodology.
- Milestone 3: written confirmation from ≥ 3 independent organisations of use in
  development or CI.
- Milestone 4: catalog regeneration for a new Canton release without manual edits; adoption
  report; maintenance owner named.

The tool must never submit, sign, or hold keys; every report must carry the caveats on what
`prepare` cannot observe.

---

## Funding

**Total Funding Request:** _(fill in)_ CC

### Payment Breakdown by Milestone
- Milestone 1 _(Core tool, delivered)_: _(fill in)_ CC upon committee acceptance
- Milestone 2 _(Validation, calibration, corpus)_: _(fill in)_ CC upon committee acceptance
- Milestone 3 _(DPM components, TS client, integrations)_: _(fill in)_ CC upon committee acceptance
- Milestone 4 _(Adoption and handover)_: _(fill in)_ CC upon final release and acceptance

_(Recommendation from the review history of #481/#297/#327: gate ≥ 40–50 % of the total on
the adoption metrics in M3/M4, and keep the total well below the ~1.9M CC asks of the
visualiser/simulator proposals — this is a focused component, not a platform.)_

### Volatility Stipulation
Project duration is **under 6 months** (5 months). Should the project timeline extend beyond
6 months due to Committee-requested scope changes, any remaining milestones must be
renegotiated to account for significant USD/CC price volatility.

---

## Co-Marketing
Upon release, the implementing entity will collaborate with the Foundation on:

- Announcement coordination
- Case study or technical blog ("what a Canton transaction costs, before you send it")
- Developer or ecosystem promotion; a joint demo with Walnut's `dpm trace` if both teams agree

---

## Motivation

The Canton Foundation Q2 DevRel survey (cited in the roadmap's RFP 20 note) rated
Transaction Debugging & Observability lowest in Q1 (2.55) and tied-lowest in Q2 (3.26), and
records "transaction simulation / dry-run tooling (Tenderly-equivalent)" as a repeated ask
across both quarters — "the longest-standing unmet need in the dataset". Fee visibility is
a subset of that need that no funded work addresses.

Who benefits: every team that submits commands programmatically — wallets (pre-sign cost
and effects), exchanges and market makers (pre-flight settlement batches; Rocky runs these
in production today), DPM app developers (CI gate on fixtures), validator operators
(explain rejections from logs with the same tool). We estimate the majority of Featured App
teams submit through their own services rather than a UI and would use a pre-flight call;
the hosted DevNet endpoint and `dpm` packaging remove the setup cost.

First-hand demand: Rocky's production integration met every failure class this tool
explains — `UNHANDLED_EXCEPTION` on custody assertions, `DAML_AUTHORIZATION_ERROR` on
party-model changes, `CONTRACT_NOT_FOUND` after version-bump patterns archived a contract,
`SEQUENCER_NOT_ENOUGH_TRAFFIC_CREDIT` during volume spikes,
`PACKAGE_NOT_VETTED_BY_RECIPIENTS` on MainNet — each debugged by hand from raw `cause`
strings and participant logs.

---

## Rationale

**Why `prepare` rather than a separate simulator.** Tenderly's #481 re-executes Daml on a
hydrated ACS inside a Virtual Participant; reviewers immediately raised ACS egress and
parity. `prepare` sidesteps both: the participant that would submit does the interpretation
on its own state, so parity is 100 % by construction and no data leaves the node. It is
also free and needs no keys. The trade-off — no confirmation-time outcomes — is stated in
every report.

**Why not extend Walnut.** We do, where it fits: canton-sim consumes and emits the same
`commands.json` / `prepared.json` / completion shapes, is packaged as `dpm` components,
and offers its effects decoder as shared code. What it adds — fee pricing and a structured,
catalog-backed diagnosis with contract-state lookup and a stable JSON contract — is outside
Walnut's funded scope (Walnut lists "more advanced simulation and what-if tooling" as an
unfunded follow-on and renders errors as text). Building these as separate components lets
`dpm trace`, DPM Debug, CI runners and wallets all call them.

**Why an open catalog.** Canton's error definitions live in Scala annotations; the public
reference page is a 2.x snapshot. Regenerating a versioned JSON catalog from the sources and
shipping it under Apache-2.0 makes the knowledge reusable by any tool and keeps it current
per release — the "public good" and "sustainability" expectations of the review process.

**Alternatives considered.** (a) A hosted SaaS — rejected: ACS/payload egress is the first
objection institutions raise. (b) A visualiser — rejected: Walnut owns it. (c) Bundling with
a CI/CD proposal (RFP 18) — rejected per the single-objective rule; the `--fail-on-reject`
gate is enough for pipelines and a full SDLC proposal can reference it.

---

## Appendices (to attach at submission)

- A. Sample reports: success with traffic/fee quote; assertion failure; authorization
  failure; archived-contract diagnosis
- B. `docs/error-catalog.md` (catalog with provenance) and the regeneration script
- C. `docs/design/architecture.md`
- D. `docs/proposal/landscape-2026-09.md` (overlap analysis with #481, #327, #297, #752, #494)
