# Contributing to canton-sim

Thank you for considering a contribution. This document covers the workflow and the rules
every change must follow.

## Workflow

1. Open an issue first for anything larger than a typo or a one-line fix, so scope can be
   agreed before code is written.
2. Fork the repository and create a branch from `main` named `feat/<topic>`, `fix/<topic>`
   or `docs/<topic>`.
3. Make the change with tests. Run the full gate locally:

   ```bash
   cargo fmt --all
   cargo clippy --all-targets -- -D warnings
   cargo test --all
   ```

4. Open a pull request against `main`. Describe what changed, why, and how it was verified.
   Link the issue. CI must be green before review.

## Coding rules

- **No floats on the money path.** All amounts, prices and fees use `rust_decimal::Decimal`.
- **Never submit.** No code path may call `execute`, `submit`, or sign anything. Tests
  assert this behaviour through the mock ledger.
- **Reports must state what they cannot know.** Any new estimate or inference adds a caveat
  or a `source` label rather than presenting itself as authoritative.
- **Tolerant parsing, strict output.** Inputs from participants and Scan are parsed
  defensively; outputs (`SimulationReport`, `Diagnosis`) are stable, documented JSON.
  A change to an output field is a breaking change and needs a note in the pull request.
- **No new system dependencies.** The build must keep working with only a Rust toolchain.
- Keep modules small and pure where possible: `canton-sim-diagnose` and `canton-sim-fee`
  do no I/O.

## Adding a catalog hint

Per-code specialisations live in `crates/canton-sim-diagnose/src/classify.rs`
(`specialise`). Each new branch needs a unit test with a realistic `cause` string taken
from a participant, and the hint must tell the developer what to check next, not restate
the error.

Catalog entries in `data/canton-error-catalog.json` are generated from Canton sources;
do not edit them by hand. Add or correct hand-written entries (`source: "manual"`) only
when the code is verified against a live participant, and say so in the pull request.

## Adding a fixture

Put command JSON under `fixtures/<package>/`, describe the expected outcome in that
directory's `README.md`, and use placeholder ids of the form `00REPLACE_…` and
`party::1220REPLACE` so nobody mistakes them for real contracts.

## Commit messages

Use the imperative mood and a scope prefix where helpful: `diagnose: parse
DAML_FAILURE meta`, `fee: load minTopupAmount from Scan`. Keep the first line under
72 characters.

## License

By contributing you agree that your contribution is licensed under the Apache License 2.0.
