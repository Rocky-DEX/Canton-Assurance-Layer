## Development Fund Proposal Submission

**Proposal file:**
`rfps/developer-experience-tooling-education/2026-09-Rocky-dpm-fee-estimator.md`

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
Developer Experience, Tooling & Education — RFP 19 "DPM Components and Extension Ecosystem" (fee estimators); supports the RFP 20 note on transaction dry-run tooling.

**Label:**
daml-tooling

---

### Funding & Timeline

**Total Funding Request:**
360,000 CC

**Project Duration:**
4 months

**Maximum Amount:**
N/A

**Maximum Duration:**
N/A

---

### Summary

Canton developers, wallets and operators cannot see what a transaction will cost before submitting it: synchronizer traffic is charged in unpredictable bytes and Canton Coin transfer fees follow a step function discovered from the wallet balance. `dpm fee` prices a command before submission using the participant's own Canton 3.4 `prepare` cost estimate and live Splice pricing from Scan, needs only read rights, never submits, and keeps all data on the node; a tested implementation is delivered with the proposal. The grant funds calibration against real sequencer charges, DPM packaging, a TypeScript client and adoption by at least three independent organisations, giving the ecosystem the fee estimator RFP 19 asks for.

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
