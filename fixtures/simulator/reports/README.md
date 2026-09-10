# Fixtures: simulation reports

Two `SimulationReport` documents as `canton-sim-server` returns them from
`POST /v1/simulate`, produced against a mock participant by
`rust/sim-server/tests/http.rs` for the `perp-custody` `Debit` command:

| File | Outcome | What it carries |
|---|---|---|
| `would-succeed.json` | `would_succeed` | the decoded effects (one consuming exercise, one create), an input contract, the traffic quote at reference pricing |
| `would-fail.json` | `would_fail` | a `CONTRACT_NOT_FOUND` diagnosis with hints, and the referenced contract looked up as archived at offset 123 |

They are samples of the wire format, not golden vectors: `command_id`,
`simulated_at` and `elapsed_ms` differ on every run. The console's render
test (`web/src/lib/simulator-render.test.ts`) draws both in English and
Simplified Chinese, so a field renamed on the Rust side fails there.

Regenerate (the path is taken from the repository root):

```bash
CANTON_SIM_WRITE_FIXTURES=fixtures/simulator/reports cargo test --manifest-path rust/Cargo.toml -p canton-sim-server
```
