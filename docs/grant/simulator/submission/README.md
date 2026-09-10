# Submission kit

Two RFP-aligned proposals in the official `proposals/_template.md` structure, each with a
PR body in the official `.github/pull_request_template.md` structure. Split per the
template's single-objective rule.

| Proposal file | PR body | RFP | Ask |
|---|---|---|---|
| `2026-09-Rocky-dpm-fee-estimator.md` | `pr-body-dpm-fee-estimator.md` | 19 (fee estimators) | 360,000 CC / 4 months |
| `2026-09-Rocky-dpm-explain-failure-explanation.md` | `pr-body-dpm-explain.md` | 19 / 20 (debugging) | 450,000 CC / 5 months |

Before opening the PRs, fill in: author / contact, Champion (or keep `Needs Champion`),
and adjust the CC amounts if the Champion advises. Funding figures are proposed from the
review history of #297 (450k), #327 and #481 (1.9M) and the committee's stated preference
for adoption-gated tranches.

Steps (from `rfps/README.md` and the repository README):

1. Fork `canton-foundation/canton-dev-fund`, branch per proposal.
2. Copy the proposal file to `rfps/developer-experience-tooling-education/<file>.md`.
3. Open a PR titled `Proposal: <Project Name>` with the PR body; label `daml-tooling`.
4. Post to `grants-discuss@lists.sync.global` and approach the "Daml Language & Developer
   Tooling" SIG for a Champion; DevRel owns the survey the proposals cite.
5. Expect the board flow: In Review → Needs Revision / Ready for Vote (about one week).

Submit the fee estimator first: cleanest gap, smaller ask, no overlap questions. Submit the
failure-explanation proposal once a Champion has confirmed the positioning relative to
Walnut (#327) and the closed #297.
