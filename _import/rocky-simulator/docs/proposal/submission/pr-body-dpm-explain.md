## Development Fund Proposal Submission

**Proposal file:**
`rfps/developer-experience-tooling-education/2026-09-Rocky-dpm-explain-failure-explanation.md`

### Applicant

**Organization:**
Rocky DEX

**Author / Primary Contact:**
_(name, GitHub handle, email)_

**Champion:**
`Needs Champion`

---

### Proposal Classification

**Proposal Type:**
- [x] RFP-aligned proposal
- [ ] Individual initiative

**RFP / Roadmap Area:**
Developer Experience, Tooling & Education — RFP 19 "DPM Components and Extension Ecosystem" (debugging workflows) and RFP 20 "Indexers" (debugging tools; DevRel survey note on transaction debugging).

**Label:**
daml-tooling

---

### Funding & Timeline

**Total Funding Request:**
450,000 CC

**Project Duration:**
5 months

**Maximum Amount:**
N/A

**Maximum Duration:**
N/A

---

### Summary

A rejected Canton submission reaches developers as an error code and a free-text cause, and the public error reference is a 2.x snapshot; the DevRel survey rates transaction debugging lowest two quarters running. `dpm explain` turns any rejection — from `prepare` before submission, from a completion, or from a log line — into a deterministic, structured diagnosis (phase, Canton's own explanation and resolution, extracted template/choice/contract/authorizer facts, archived-vs-unknown contract state, next steps) backed by an open 228-code catalog regenerated from Canton's sources per release; a tested implementation is delivered with the proposal. The grant funds a labelled corpus with measured precision, DPM packaging, a versioned diagnosis schema consumed by `dpm trace` and DPM Debug, and adoption by at least three independent organisations.

---

### Submission Checklist

- [x] Full proposal file is included in this PR
- [x] Organization and primary contact identified
- [x] Champion identified or `Needs Champion` selected
- [x] RFP / roadmap alignment identified, if applicable
- [x] Total funding request provided
- [x] Project duration provided
- [x] Proposal is within any RFP maximum amount
- [x] Proposal is within any RFP maximum duration
- [x] Milestones and milestone funding are defined in the proposal
- [x] Acceptance criteria are based on ecosystem value
- [x] Architectural alignment is addressed
