# Grant proposal draft — canton-sim: pre-submit transaction simulation for Canton

**RFP alignment:** RFP 20 (Indexers — annex: transaction simulation / dry-run tooling)
**Category:** Developer tooling · debugging & observability
**Applicant:** Rocky DEX (Rocky-DEX on GitHub) — operators of a Canton MainNet perpetuals/spot
exchange with an in-production Rust Ledger API integration (`canton-bridge`)
**License:** Apache-2.0 · **Repository:** `Rocky.simulator`
**Status of this document:** draft for internal review before submission

---

## 1. Summary

canton-sim is a Tenderly-style simulation tool for Canton: developers submit a Ledger API
command to it instead of to the ledger and get back (a) the exact ledger effects the command
would produce, (b) if it would be rejected, a structured explanation of why and what to do,
and (c) an estimate of the synchronizer traffic and Canton Coin fees it would cost.

It is built on the interactive-submission `prepare` endpoint that Canton 3.3+ already
exposes, so the simulation is the participant's own interpretation of the command, not a
re-implementation of Daml. Milestone 1 — CLI, HTTP service and embeddable Rust crates with
a mock-tested pipeline and a 228-code error catalog extracted from the Canton 3.4 sources —
is delivered with this proposal as working code.

## 2. Evidence of demand (guideline §4.1)

- The Canton Foundation DevRel quarterly developer survey has rated **"transaction debugging
  & observability" the lowest-scoring area for two consecutive quarters**, and the write-in
  responses explicitly ask for "a Tenderly-level simulation tool". *(Attach the two survey
  extracts and the DevRel summary as Appendix A.)*
- RFP 20's annex names transaction simulation / dry-run as a wanted-but-unbuilt component.
- First-hand: Rocky's production integration hit every failure class this tool explains —
  `UNHANDLED_EXCEPTION` on custody assertions, `DAML_AUTHORIZATION_ERROR` on party-model
  changes, `CONTRACT_NOT_FOUND` after version-bump patterns archived a contract,
  `SEQUENCER_NOT_ENOUGH_TRAFFIC_CREDIT` during volume spikes, `PACKAGE_NOT_VETTED_BY_RECIPIENTS`
  on MainNet — each debugged by hand from raw `cause` strings and participant logs. The
  fixtures in this repository are those cases.

## 3. Problem

A Canton developer today learns that a command is wrong only by submitting it. The failure
comes back as a code and a free-text `cause`; the error reference is spread across Scala
annotations and a 2.x-era doc page; and there is no way to see what a *successful* command
will create or archive before it is committed. Fees are invisible: traffic is charged in bytes
that nobody can predict, and Canton Coin transfer fees are a step function most integrators
discover from their wallet balance.

The ecosystem's answer on EVM chains — Tenderly's simulate/explain/estimate loop — does not
exist for Canton.

## 4. Solution

### 4.1 What canton-sim does

| Question | Mechanism | Output |
|---|---|---|
| What will this do? | `POST /v2/interactive-submission/prepare`; decode the `PreparedTransaction` protobuf | Node tree (create / exercise consuming or not / fetch / rollback) with template, choice, arguments, signatories, stakeholders; informees; input contracts and which are archived; validity window (`maxRecordTime`) |
| Why would it fail? | Parse `JsCantonError`; classify the phase; extract facts from the cause; attach Canton's explanation & resolution; look up referenced contracts | `Diagnosis {code, phase, title, summary, extracted{template, choice, contract ids, missing authorizers, assertion message, errorId}, hints, retryable}` plus `contract_states` (active / archived at offset N / unknown to this participant) |
| What will it cost? | `estimateTrafficCost` in the prepare request → `costEstimation`; price with Scan's `extraTrafficPrice` and `amuletPrice`; recognise Amulet transfers and apply Splice's `TransferConfigUSD` | Traffic bytes → USD → CC; Amulet transfer + create + lock-holder fees |

Surfaces: CLI (`canton-sim simulate|explain|contract|effects|fee|catalog`, `--json`,
`--fail-on-reject` for CI), HTTP service (`POST /v1/simulate`, `/v1/explain`,
`/v1/catalog`), Rust crates for embedding in wallets (show users what they sign), trading
bots (pre-flight every order settlement) and DPM tooling.

### 4.2 Why `prepare` is the right foundation

`prepare` runs package resolution, Daml interpretation, Daml authorization, contract
visibility and synchronizer routing on the participant and stops before sequencing. A
rejection from `prepare` is the rejection a real submission would get; a success is the
exact transaction that would be committed, with its traffic cost computed by the node that
would pay it. It requires only *read* authorization on the acting parties, so a developer
with a read-only token can simulate for any hosted party without keys. Nothing is charged
and no deduplication state is created.

What `prepare` cannot see — contention on input contracts, package vetting on
counterparties' participants, sequencer-time bounds — canton-sim states explicitly in every
report's caveats rather than hiding.

### 4.3 Division of work with Walnut (Rationale)

Walnut's August proposal covers **post-hoc DPM trace visualisation**: rendering the
transaction tree of updates that have already been committed, from the update stream.
canton-sim is strictly **pre-submit**: its input is a command, its data source is the
prepared transaction and the rejection, and its outputs are "would it work", "why not" and
"what will it cost". The two do not overlap in data source, timing or user flow, and they
compose: a developer simulates with canton-sim, submits, and inspects the committed result
in Walnut. We will align on a shared JSON shape for transaction nodes (canton-sim's
`Effects.nodes` is already structured per node with template/choice/parties) so Walnut's
renderer can display a canton-sim preview if both teams want that; this is offered, not
required for either grant.

## 5. Deliverables and milestones

| # | Milestone | Deliverable | Acceptance |
|---|---|---|---|
| 1 | **Core tool** (delivered with this proposal) | `canton-sim` CLI, `canton-sim-server`, crates `canton-sim-{proto,diagnose,fee,core}`; prepare-based simulation; effects decoder; 228-code catalog with cause parsing and hints; traffic & Amulet fee pricing with Scan loader; mock-tested CI | Repository public under Apache-2.0; `cargo test --all` and clippy `-D warnings` green in CI; fixtures documented |
| 2 | **Live validation & calibration** | Run the fixture set and Rocky's real custody/settlement commands against LocalNet, DevNet and a MainNet validator; verify every catalog entry marked `manual`; calibrate traffic estimates against `traffic_control.traffic_state` deltas and document the error bound; publish a DevNet-hosted `canton-sim-server` | Written validation report with per-error-class coverage; ≥ 90 % of observed rejection codes classified with a specific (non-generic) explanation; estimate-vs-actual traffic within a documented bound on ≥ 95 % of sampled transactions |
| 3 | **Developer experience** | Web UI for the effects tree and diagnosis (static SPA over the HTTP API); VS Code / IDE-agnostic "explain this error" snippet; TypeScript client package for the HTTP API; DPM component packaging (RFP 19 style: template + deploy helper) | UI and TS client published; three external teams (targets: a wallet, a validator operator, a DPM app team) using it with written feedback |
| 4 | **Ecosystem integration & handover** | Docs on docs.sync.global-compatible format; contribution of the error-catalog extraction script upstream (or to the DevRel docs) so the catalog regenerates per Canton release; Champion sign-off; maintenance plan | Catalog regenerated for the next Canton minor release by the script alone; DevRel survey question on "transaction debugging" re-asked in the following quarter |

Timeline: M1 delivered; M2 6 weeks; M3 8 weeks; M4 4 weeks.

## 6. Adoption plan and Champion

- **Primary users:** DPM app developers (RFP 19 audience), wallet teams (pre-sign preview),
  exchange/market-maker integrators (pre-flight settlement batches), validator operators
  (explain rejections in their logs with `canton-sim explain`).
- **Champion candidates:** Canton Foundation DevRel (owner of the survey that motivates the
  RFP); a wallet team already integrating interactive submission; a node-service provider
  whose support load is rejection triage.
- **Distribution:** cargo install, Docker image, DevNet-hosted service, TS client on npm.
- **Feedback loop:** the DevRel survey item is the adoption metric; we will also count
  `explain` catalog hits by code to find where hints are weakest.

## 7. Team and prior work

Rocky DEX runs a Canton MainNet exchange: order matching off-chain in Rust, custody and
settlement as Daml contracts, with a `canton-bridge` service that already uses interactive
submission (`prepare` + KMS external signing) and the JSON Ledger API v2 in production.
canton-sim reuses that verified knowledge of request shapes, error bodies and live API
behaviour; the vendored Ledger API protos come from the same codebase.

## 8. Budget

*(Fill in per guideline §X: engineering time per milestone, DevNet hosting, audit of the
fee-model arithmetic, documentation.)*

## 9. Risks

| Risk | Mitigation |
|---|---|
| `prepare` limited to one command per request | Documented hint; `CreateAndExerciseCommand`/helper-choice guidance; track the Canton roadmap for multi-command prepare |
| Traffic estimate diverges from actual charge (amplification, signature sizes, reassignment) | `expectedSignatures` hint passed through; caveat in every report; M2 calibration with a published error bound |
| Catalog drifts with Canton releases | Extraction script from Canton sources; regeneration is an M4 acceptance criterion |
| Overlap concerns with Walnut | Scope stated in §4.3; shared node JSON offered |
| Splice fee config shape changes across Scan versions | Tolerant loader (walks for `transferConfig` / `amuletPrice`), fixture-tested, with `source` labelling so stale defaults are visible |

## 10. Appendices

- A. DevRel survey extracts (two quarters) and the "Tenderly-level" write-ins
- B. Sample reports: success, assertion failure, authorization failure, archived contract
- C. Error catalog (`docs/error-catalog.md`)
- D. Architecture (`docs/design/architecture.md`)
