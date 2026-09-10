# Rocky × Canton Assurance Layer — Roadmap 2026–2027

**From:** Rocky (derivatives and spot exchange built natively on Canton)
**To:** Canton Foundation — Development Fund, Technology & Operations Committee, DevRel
**Date:** 2026-09-09
**Status:** Public roadmap. Development Fund proposals referenced below will be submitted separately under the RFP paths named for each phase.

---

## 1. Why we are writing

Canton keeps institutional data private, and that removes the public evidence a public chain produces as a side effect. The 2026–2028 Strategic Roadmap names the consequence in RFP 11 (*Public verifiability*): an aggregate published by an issuer might not be trusted by the market, and disclosing transactions defeats confidentiality.

Rocky has been operating a solution to the first tier of that RFP in production since August 2026. The Canton Assurance Layer turns a private ledger snapshot into a signed, selectively disclosed, independently verifiable statement — proof of solvency first, with reserve coverage, repo collateralisation, fund NAV backing, DvP settlement integrity and holder eligibility on the same machinery. Every Rocky customer can verify, in their own browser, that their balance is inside the liabilities total we publish, without learning anything about anyone else.

This document sets out where we intend to take that work over the next five quarters, which RFPs each phase answers, and what we are asking the Foundation for. Everything is Apache-2.0 at [github.com/Rocky-DEX/Canton-Assurance-Layer](https://github.com/Rocky-DEX/Canton-Assurance-Layer).

## 2. Where we are today

| Delivered | Evidence |
|---|---|
| Wire format specification v1.2, frozen against a conformance corpus | `SPEC.md` §1–§18; every normative section has at least one conformance case |
| Three implementations that agree on every case | Rust producer/verifier, TypeScript browser verifier, and a dependency-free Python verifier written from the specification text alone; 61 conformance cases; compatibility statements compared in CI |
| Six disclosure profiles | `solvency.liabilities`, `solvency.coverage`, `collateral.repo`, `fund.nav`, `settlement.dvp`, `eligibility.holder`; hierarchical (group → entity → customer) commitments |
| Assurance levels enforced by the verifier | A figure is `cryptographically-verified`, `ledger-derived`, `third-party-attested`, `issuer-attested`, `claimed-only` or `not-disclosed`; a declaration the verifier cannot substantiate is a failure |
| Disclosure manifest inside the signature | Per-field published / committed / withheld; a reduction in disclosure between reports is on the record and diffable |
| Asset side read from a live participant | `canton-reserve-attest` validated read-only against a Canton mainnet participant; custody positions committed to a signed coverage report at a pinned offset |
| On-ledger anchoring | Daml package compiled, tested, deployed to a Canton sandbox; three-anchor history read back by an auditor and a regulator party |
| Independent verification toolkit | `canton-solvency-verify` CLI, an offline single-file browser verifier, JSON Schemas, evidence packs; one proof of a million-customer book verifies in under a millisecond |
| Operator surfaces | Publisher console, customer portal, auditor workspace and public transparency page, self-hostable with `docker compose`; English and Simplified Chinese |
| Production use | Daily solvency reports and the public Transparency page at Rocky |
| Honest limits, documented | `docs/SECURITY-ANALYSIS.md`: an inclusion proof cannot prove every customer is in the tree; custody rests on attestation; key distribution via anchors is a deployment obligation |

Two things remain that this project cannot deliver by itself: an implementation by an organisation that did not write the specification, and a third-party security review. Both are scoped and drafted (`docs/INTEGRATORS.md`, `docs/SECURITY-REVIEW-BRIEF.md`, `docs/outreach/`). They are the centre of Phase 1.

## 3. Principles that will not change

1. **Verification stays in the client.** A server is a delivery mechanism, never an authority. Nothing we ship will ask a reader to trust Rocky, or the publisher, for the arithmetic.
2. **A format, not a product.** The deliverable is a specification anyone can implement and a corpus that decides disagreements at a named case. Rocky's implementation is one of several.
3. **Say what is proven and what is asserted.** Assurance levels exist so that a recomputed total and a signed claim are never reported in the same word.
4. **Both sides of the inequality are private.** Nothing in the format depends on publicly observable protocol metadata; every input is the publisher's own ledger view or public network configuration.
5. **Wire compatibility.** Any change that breaks a golden vector ships under a new domain string. Evidence signed last quarter verifies today.

## 4. Roadmap

```
2026 Q4          2027 Q1          2027 Q2          2027 Q3          2027 Q4 →
├─ Phase 1: Standardisation (RFP 11) ────────────┤
                 ├─ Phase 2: RWA disclosure profiles (RFP 12.2) ───────────┤
                                  ├─ Phase 3: Console & compliance evidence (RFP 27) ──────┤
                                                                    ├─ Phase 4: Attested aggregation (RFP 11, next tier)
```

### Phase 1 — Standardisation (Oct 2026 – Mar 2027) · RFP 11 Public verifiability

**Goal:** a disclosure report published by any Canton institution can be verified by a party using none of the publisher's software.

- A second, independent implementation by an organisation outside Rocky, publishing a compatibility statement over the conformance corpus, with its reports verified by our toolkit on every commit (`interop/`). Any disagreement is treated as a specification defect until shown otherwise.
- A third-party security review of the commitment core, salt derivation and verifiers, with findings and remediations published in the repository, including anything we choose not to fix and why.
- Packaged verifiers: crates.io, npm, prebuilt binaries, documentation in the Foundation's format.
- Submission of the Canton Improvement Proposal for the wire format (draft: `docs/cip/CIP-draft-proof-of-solvency.md`), with the conformance corpus as its normative tests.
- Adoption target: at least three organisations other than Rocky — a publisher, a verifier operator such as an auditor or market-data provider, and an integrator embedding the offline verifier — confirm use.

Development Fund proposal: `rfps/financial-markets-standards-verification/`, single objective, majority of funding gated on the adoption target. We will submit once a Champion has confirmed.

### Phase 2 — Institutional RWA disclosure profiles (Dec 2026 – Sep 2027) · RFP 12.2 Daml and Institutional RWA Workflow Standards

**Goal:** the repo, fund NAV, DvP and eligibility profiles are exercised end to end by real issuers and platforms, not only by us.

- `coverage.custody` reads holdings directly from a participant, against token-standard holding contracts, pinned to the same ledger offset as the liabilities snapshot.
- One tokenised-fund issuer publishing `fund.nav`; one repo or settlement platform publishing `collateral.repo` or `settlement.dvp`; each leaving conforming documents in `interop/`.
- Profile registry entries and conformance cases carried into the CIP as its RWA annex.
- Adoption target: at least two issuers publishing on a profile other than `solvency.liabilities` on a recurring schedule.

### Phase 3 — Disclosure console and compliance evidence (Apr 2027 – Dec 2027) · RFP 27 Security Monitoring, Auditability and Evidence

**Goal:** a compliance team publishes, anchors and distributes disclosure without writing code; an auditor or regulator re-verifies a complete evidence pack in the browser.

- On-ledger anchoring on a synchronizer carrying real value, with a documented approach to provisioning a public observer party.
- Key management behind a KMS or HSM boundary; scheduled publishing from a participant; the hosted instance and the self-hosted build kept identical.
- Threats monitored, stated in RFP 27's terms: restated history, understated liabilities, reduced disclosure, and two audiences handed different books. Scope: entity level. Data sources: the publisher's own ledger snapshot and active-contract set, all node-local. Selective disclosure: the manifest, audience-scoped packagings, and anchors that carry digests and never amounts.
- Adoption target: at least three organisations publishing through the console, and at least one audit firm using the auditor workspace to issue an opinion.

### Phase 4 — Attested aggregation (2028) · RFP 11, next tier

The format's documented limit is completeness: one inclusion proof cannot show that every customer is in the tree. Phase 4 builds the tree from the ledger snapshot inside a trusted execution environment so that `ledger-derived` becomes remotely attestable, answering RFP 11's middle tier. It will be proposed separately, after Phase 1 has produced an outside implementer and a public security review.

## 5. Relationship to other work in the ecosystem

- **Token Standard v2 / CIP-56 holdings** are the natural source for the custody side of coverage; Phase 2 reads them directly.
- **Canton Reserve Attestation (Dev Fund PR #759)** enforces solvency inside Daml for Canton-native assets. The two are complementary: its on-ledger attestation contract can carry our report root, and our format covers the assets and liabilities that are not Canton contracts.
- **Commodity Reserve Infrastructure (PR #87)** accepts third-party proof-of-reserves attestations; our coverage statement is an interchangeable input for that interface, and we would welcome ARU as a Phase 2 issuer.
- **Hacken's monitoring stack (approved, PR #302)** and market-data providers such as Kaiko are the verifier operators Phase 1 targets.
- **Walnut's `dpm trace` and Rocky's own DPM proposals** (fee estimation, failure explanation) are developer-tooling work under RFP 19/20 and are proposed independently. The code behind those proposals, the `canton-sim` transaction simulator, lives in this repository under `rust/sim-*` so that one CI, one security policy and one maintainer cover both tracks; it shares no format or trust assumption with the disclosure work above.

## 6. What we ask of the Foundation

1. **A Champion for the Phase 1 proposal**, from the SIG covering financial-market standards and verification, and a slot at that SIG's meeting for a fifteen-minute walkthrough. The demonstration is: clone the repository, run the dependency-free verifier against the corpus, and verify a live Rocky proof in the offline page.
2. **Introductions** to two kinds of organisation: a custodian, exchange or tokenised-fund issuer willing to be the second implementer or a Phase 2 publisher, and an audit or market-data firm willing to run a verifier.
3. **Guidance on the CIP path** for a wire format: whether the profile registry belongs in the CIP or a separate registry document, and what the process accepts as evidence of a second implementation.
4. **A pointer to security assessors** operating under RFP 21 who would take the scoped review in `docs/SECURITY-REVIEW-BRIEF.md`.

## 7. What Rocky commits to

- Everything stays Apache-2.0, in one public repository, with the specification as the artefact under review rather than our code.
- A named maintainer and a written maintenance plan in every proposal; Rocky's own daily publication is the standing regression test.
- Funding requests split by phase, each under six months, each with a single objective, with the majority of each tranche gated on adoption by organisations other than Rocky.
- Co-marketing with the Foundation on each phase: announcement, a technical write-up, and joint sessions with adopting organisations.
- Defects found by outside implementers are published in `spec-audit/README.md` under their own headings, including the ones in our code.

## 8. Contact

Rocky — [rocky.exchange](https://rocky.exchange) · Issues and discussion: [github.com/Rocky-DEX/Canton-Assurance-Layer/issues](https://github.com/Rocky-DEX/Canton-Assurance-Layer/issues) · Primary contact: _(name, GitHub handle, email)_
