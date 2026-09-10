# Contributing to Canton Proof-of-Solvency

Thanks for your interest in contributing! This document covers the
development setup, quality bar, and the one rule that is special to this
project.

## The Golden-Vector Rule (read this first)

The Rust producer and the TypeScript verifier implement one byte-level wire
format, pinned by the golden vectors in [SPEC.md](SPEC.md) §6 and asserted by
tests on **both** sides.

- A change that keeps all golden-vector tests passing is a refactor. Welcome.
- A change that breaks any golden vector is a **wire-format version bump**:
  it must introduce new domain strings (`…-v2`), update SPEC.md with a new
  vector section, keep v1 verification working for historical reports, and be
  discussed in an issue *before* the PR.

Silent format drift is the one bug this project exists to make impossible —
including in itself.

## Development Setup

Prerequisites: Rust ≥ 1.88 (the `rust/` workspace includes the simulator
crates, which need it; the published assurance crates keep 1.75 as their own
floor), Node.js ≥ 18. Optionally Python 3 for the
specification audit and the Daml SDK for the anchoring package.

```bash
scripts/check.sh            # everything
scripts/check.sh rust       # or one section: rust | ts | web | audit | daml
```

**CI runs this script**, section by section, rather than its own copy of the
commands — so a green run locally is a green run in CI, by construction. This
paragraph used to list the commands and claim CI ran exactly them; it had
drifted to three crates out of four, with no rustdoc, no specification audit
and no Daml.

A section whose toolchain is missing is skipped with a notice rather than
failing, so you can work on the Rust core without installing the Daml SDK. CI
installs everything, so nothing is skipped there.

Everything in `fixtures/` is asserted byte for byte by both implementations —
the v1 and v2 reports, the v1 and v2 proofs, and the group report and
membership. If a deliberate format change makes them stale, regenerate with:

```bash
cargo run --manifest-path rust/solvency-report/Cargo.toml --example print_golden
```

and update the matching SPEC section in the same commit (§10 for the report
and proof, §13.6 for the group, §14 for a profile). **Never edit a fixture by
hand to make a test pass.**

Every fixture must also have a JSON Schema in `schemas/` that accepts it; a
test enumerates the directory and fails if a new document format ships without
one.

## The Hosted Console

`web/` is the SaaS (Next.js) and `rust/solvency-service` its signing service;
`web/README.md` has the local run. Two rules when changing them: verification
logic is imported from `ts/verifier`, never reimplemented, and a signed
document is stored and served as the exact bytes the service returned. A
page that summarises a result server-side labels it "server reading" and
re-derives it in the browser before calling it verified.

## The Transaction Simulator

`rust/sim-*` is `canton-sim`: pre-submit simulation, failure explanation and
fee estimation over the Ledger API's interactive-submission `prepare` step.
Its user documentation is [docs/simulator/README.md](docs/simulator/README.md)
and its design [docs/simulator/architecture.md](docs/simulator/architecture.md).
It runs under the same `scripts/check.sh rust` gate as everything else. Rules
particular to it:

- **No floats on the money path.** Amounts, prices and fees use
  `rust_decimal::Decimal`.
- **Never submit.** No code path may call `execute`, `submit`, or sign
  anything; the mock-ledger tests assert this.
- **Reports must state what they cannot know.** A new estimate or inference
  adds a caveat or a `source` label rather than presenting itself as
  authoritative.
- **Tolerant parsing, strict output.** Inputs from participants and Scan are
  parsed defensively; `SimulationReport` and `Diagnosis` are stable, documented
  JSON, and a change to an output field is a breaking change that needs a note
  in the pull request.
- **No system dependencies.** The protos are compiled with `protox`; the build
  must keep working with only a Rust toolchain.
- **Catalog hints** live in `rust/sim-diagnose/src/classify.rs` (`specialise`).
  Each branch needs a unit test with a realistic `cause` string from a
  participant, and the hint must say what to check next rather than restate
  the error. `data/canton-error-catalog.json` is generated from Canton sources
  — do not edit it by hand; hand-written entries (`source: "manual"`) are added
  only once the code is verified against a live participant, and the pull
  request says so.
- **Simulator fixtures** go under `fixtures/simulator/<package>/` with the
  expected outcome in that directory's `README.md`, using placeholder ids of
  the form `00REPLACE_…` and `party::1220REPLACE`. They are not golden
  documents and need no schema.

## Adding a Language to the Browser Pages

Strings for the three pages live in `ts/verifier/src/i18n/`: one catalog for
the verifier and console (`verifier-messages.ts`), one for the designer
(`designer-messages.ts`), and a runtime with no text of its own (`core.ts`).
To add a locale, add its code and native name to `LOCALES` in `core.ts` and a
full table to **both** catalogs; the console has its own `web/messages/*.json`
and `web/src/i18n/config.ts`. The tables are typed against the English
one, so a missing key fails `tsc`; `i18n.test.ts` also checks that every
locale carries the same `{placeholders}` as English and uses only the two
inline tags the renderer knows (`<code>`, `<strong>`). Then run
`npm run build:offline` and commit the regenerated pages.

## Pull Request Guidelines

- **Tests first.** Every behavior change lands with a test that fails
  without it. Bug fixes include a regression test reproducing the bug.
- **Both sides.** If your change touches serialization, hashing, or proof
  semantics, update Rust *and* TypeScript in the same PR, with matching
  tests.
- **Small and focused.** One logical change per PR; separate refactors from
  behavior changes.
- **Commit style.** `type(scope): summary` (e.g. `fix(merkle): reject
  duplicate assets in sums`), imperative mood, body explains *why*.
- **No new runtime dependencies** in the core crate or the verifier without
  prior discussion in an issue — auditability of this code is a feature.

## Reporting Issues

- Bugs and feature requests: open a GitHub issue with reproduction steps or
  a concrete use case.
- Security vulnerabilities: **do not open an issue** — follow
  [SECURITY.md](SECURITY.md).

## Code of Conduct

This project adheres to the
[Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you are
expected to uphold it.

## License

By contributing, you agree that your contributions are licensed under the
[Apache-2.0](LICENSE) license that covers the project.
