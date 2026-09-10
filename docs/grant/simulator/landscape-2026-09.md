# Competitive landscape — transaction simulation / debugging on Canton (as of 2026-09-09)

Source: PRs and merged proposals in
[canton-foundation/canton-dev-fund](https://github.com/canton-foundation/canton-dev-fund).
This corrects the assumption in the internal roadmap that the dry-run space is empty and
that Walnut only covers post-hoc trace replay.

| # | Proposal | Org | Status (2026-09-09) | Ask | What it covers | Overlap with canton-sim |
|---|---|---|---|---|---|---|
| [#481](https://github.com/canton-foundation/canton-dev-fund/pull/481) | Tenderly Simulation for Daml on Canton | **Tenderly** | Open, Champion assigned (Jatinp26), label `Core/ready for vote` | 1,875,000 CC / 12 months, 41 % adoption-gated | Hosted / VPC "Virtual Participant" embedding the Daml-LF Speedy interpreter; ACS hydration; state diff; failure analysis; Tenderly dashboard + API. Canton integration layer open source, engine and dashboard commercial. | **High** on "simulate before submit". Different mechanism (re-executes Daml off-participant on a hydrated ACS) vs canton-sim (asks the participant to `prepare`). Reviewer pushback: cost, ACS leaving the customer's environment, adoption gating. |
| [#327](https://github.com/canton-foundation/canton-dev-fund/pull/327) → [`proposals/2026-08-Walnut-dpm-trace-visualization.md`](https://github.com/canton-foundation/canton-dev-fund/blob/main/proposals/2026-08-Walnut-dpm-trace-visualization.md) | DPM Trace: transaction visualization, source-aware debugging | **Walnut** | **Approved / merged 2026-08-06** | 1,900,000 CC, 50 % adoption-gated; M3 = 310,000 CC | M1 trace CLI for committed updates; M2 interactive visualizer; **M3 `dpm trace prepare --commands commands.json` (Canton prepare flow, visualized, labelled "prepared"), failed submissions via the completion stream, `dpm trace compare --prepared … --update/--command-id`**; M4 adoption (≥ 2 orgs). "More advanced simulation and what-if tooling" listed as an unfunded follow-on. | **Medium–high.** Walnut *does* cover pre-submit prepare visualization. It does **not** cover: error-code catalog / structured diagnosis, contract-state lookup, traffic / fee estimation, an HTTP API or CI gate. |
| [#297](https://github.com/canton-foundation/canton-dev-fund/pull/297) | Canton Failure-Classification Engine | InfraSingularity | **Closed 2026-09-02** — "team already has an active Development Fund grant… would first like to see the deliverables from that work" (not rejected on merit) | 450,000 CC (revised from 720,000) | Deterministic classifier for rejected submissions; open rejection taxonomy + declarative decoder rules; labelled corpus with precision ≥ 90 % target; versioned JSON "integration contract" for DPM Trace / DPM Debug / CI; packaged as a `dpm` component. | **High** with `canton-sim-diagnose`. The committee saw the need; the slot is open, and the reviewers' bar (measured precision on a corpus, integration contract, SDK-version gating) is documented. |
| [#752](https://github.com/canton-foundation/canton-dev-fund/pull/752) | Ledger Investigation for Development and Support (Daml Shell) | Digital Asset | Open, label `rfp-20:indexers-observability` | 1,050,000 CC / 8 months | Open-sourcing Daml Shell: node-local forensic REPL over PQS; cites the same DevRel survey (9 of 35 respondents already use it). | Low. Post-hoc, node-local, PQS-based. |
| [#494](https://github.com/canton-foundation/canton-dev-fund/pull/494) | DPM Debug — visual debugging plugin | Lazer Technologies | Open, `needs-champion`; reviewers asked for demand evidence and "fit with Walnut's tooling" | 1,000,000 CC / 16 weeks | Visual workbench consuming Walnut's trace artifacts. | Low, but shows the committee's **sensitivity to overlap with Walnut**. |
| [#743](https://github.com/canton-foundation/canton-dev-fund/pull/743) | Versioned Debug Info Metadata for Daml | Walnut (djolertrk) | Open, `champion-confirmed`, `rfp-19:dpm-components` | — | Compiler debug metadata for source-aware traces. | None. |

## What is still uncovered

1. **Fee / traffic cost estimation.** No proposal touches it. RFP 19 lists "fee estimators"
   explicitly with "no prior grant examples"; the review-process guidance lists "simplified
   traffic accounting" as an App-Building priority; Canton 3.4's
   `PrepareSubmissionResponse.cost_estimation` is new and unused by any tool. `canton-sim-fee`
   plus the Scan loader is a complete first implementation.
2. **Structured failure explanation as a public good.** Walnut renders "completion status and
   error details"; Tenderly's failure analysis lives inside a commercial dashboard;
   InfraSingularity's open taxonomy was closed for portfolio reasons. An open, versioned
   error catalog (`canton-error-catalog.json`, regenerated from Canton sources) with a
   stable diagnosis JSON that `dpm trace`, DPM Debug, CI runners and wallets can consume is
   still missing. `canton-sim-diagnose` already implements the catalog, cause parsing and
   the JSON shape.
3. **Machine-readable pre-flight for CI, bots and wallets.** Walnut's prepare flow is a CLI
   for humans; Tenderly's is a hosted API. A participant-side, key-less, open HTTP/exit-code
   gate ("would this fail, why, what will it cost") is not proposed by anyone.

## Consequences for the proposal

- Do **not** submit "a Tenderly-level simulator" as the headline: Tenderly is at
  ready-for-vote with that exact headline, and Walnut owns `dpm trace prepare`. A third
  prepare-visualizer will be asked "why not extend Walnut" (template Rationale: "the default
  approach should be to extend what exists").
- Position canton-sim as **DPM components that extend Walnut's `dpm trace` and stand alone
  for CI/wallets**: `dpm fee` (traffic + Amulet cost of a prepared transaction) and
  `dpm explain` (open error catalog + diagnosis JSON + contract-state lookup), both
  consuming the same `prepared.json` / completion payloads Walnut defines. Offer the effects
  decoder as shared code rather than a competing visualizer.
- The template's single-objective rule (§1) and the internal roadmap's note (guideline §14.2:
  split distinct deliverables) argue for **two proposals**: fee estimation (RFP 19/20, clean
  gap, small, fast Champion) and failure explanation (RFP 19/20, contested, needs a corpus
  and precision metric like #297 promised).
- Expect the review bar seen on #481/#297/#327: ≥ 40–50 % of funding adoption-gated, named
  pilot organisations, "≥ 3 independent organisations confirm", measured precision on a
  labelled corpus, no ACS/data leaving the node, `dpm` component packaging, maintenance plan.
- Demand evidence is public: the roadmap's RFP 20 note quotes the DevRel survey (Q1 2.55,
  Q2 3.26, tied lowest; "Tenderly-equivalent" repeated ask). The survey document itself is a
  Google Doc linked from the roadmap and may need access.
