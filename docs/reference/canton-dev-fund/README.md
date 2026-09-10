# Canton Development Fund reference material

Snapshots taken 2026-09-09 from
[canton-foundation/canton-dev-fund](https://github.com/canton-foundation/canton-dev-fund)
(proposal documents there are CC0-1.0). Kept here so the proposal can be drafted offline
against the exact template and rules; re-check the upstream files before submitting.

| File | Upstream |
|---|---|
| `proposal-template.md` | `proposals/_template.md` — the required proposal structure |
| `pull-request-template.md` | `.github/pull_request_template.md` — the PR body and checklist |
| `proposal-review-process.md` | `Development Fund Proposal Review Process.md` — board workflow, "Grant Evaluation Expectations" |
| `rfps-README.md` | `rfps/README.md` — RFP-aligned vs individual paths, pre-submission checklist |
| `roadmap-excerpt-developer-experience-rfps-14-20.md` | `2026-2028-strategic-roadmap.md`, section "Developer Experience, Tooling & Education" (RFP 14–20, incl. the RFP 20 DevRel survey note) |

Not found publicly: the **"Grant Guidance document"** with the detailed evaluation rubric
referenced in the review process (section 3). It appears to be shared through the
Foundation / Champions rather than the repository. Contact: dev-fund@canton.foundation,
grants-discuss@lists.sync.global.

Submission path for an RFP-aligned proposal: `rfps/developer-experience-tooling-education/<file>.md`
(directory currently holds only `.gitkeep`), PR title `Proposal: <Project Name>`, one label from
the template list (`daml-tooling` fits), Champion from `sig-directory.md` ("Daml Language &
Developer Tooling" SIG) or `Needs Champion`.
