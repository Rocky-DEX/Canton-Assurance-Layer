# Canton Assurance Layer — hosted console

The SaaS surface over the disclosure format: a publisher workspace, a customer
portal, an auditor workspace and a public transparency page per organisation.
Design: [`docs/superpowers/specs/2026-09-09-saas-console-design.md`](../docs/superpowers/specs/2026-09-09-saas-console-design.md).

**Verification stays in the client.** Every "recomputed here" badge on these
pages was computed in the reader's browser by the same modules the offline
pages and the test suite use (`ts/verifier`, imported as source). The server
stores and serves documents exactly as signed; it is never the authority on
whether they verify.

## Run locally

Prerequisites: Node.js ≥ 20.9, Rust ≥ 1.88 (for the signing service and the
simulator). No Docker or Postgres needed on the machine.

```bash
# 1. Postgres, downloaded into node_modules (keep this running)
cd web && npm install && npm run db:dev

# 2. In another terminal: schema, env, demo data
cd web && cp .env.example .env && npm run db:migrate && npx tsx scripts/seed-demo.ts

# 3. The signing service (the only process that holds signing keys)
cd rust/solvency-service && SERVICE_TOKEN=dev-service-token-dev-service-token-0000 \
  SERVICE_KEK=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
  KEYSTORE_DIR=./keystore cargo run

# 4. The console
cd web && npm run dev          # http://localhost:3000

# Optional: the transaction simulator behind the Simulator page. Needs a
# participant's JSON Ledger API and a read-only token; the Explain and Fee
# tabs work without one.
cd rust && cargo run -p canton-sim-server -- --ledger https://validator.example/api/json-api \
  --token-file token.jwt --listen 127.0.0.1:8787     # SIMULATOR_URL in web/.env
```

Sign in as `owner@demo.example`: with no `EMAIL_SERVER` configured, the magic
link is written to `.devmail.log` and shown at
[http://localhost:3000/dev/mail](http://localhost:3000/dev/mail). The seed
prints an API key; publish with it:

```bash
curl -X POST "http://localhost:3000/api/v1/orgs/demo-exchange/publications?snapshot_time=2026-09-09T10:00:00Z&ledger_offset=3042" \
  -H "Authorization: Bearer cal_…" -H "Content-Type: text/csv" --data-binary @balances.csv
```

Then open the console, the portal (as `alice@demo.example`), the audit
workspace (as `auditor@demo.example`) and the public page at `/p/demo-exchange`.

## Self-host

```bash
cp .env.compose.example .env      # at the repository root; fill in the secrets
docker compose up --build         # web on :3000, service and Postgres internal
```

## Layout

| Path | What |
|---|---|
| `src/app/app/[slug]/…` | publisher workspace: overview, publications (+ wizard), custody, coverage, history, simulator, customers, members, API keys, settings |
| `src/app/app/[slug]/simulator/` | transaction simulator: simulate a command, explain an error, estimate fees; reports are shown, never stored |
| `src/app/portal/…` | customer portal: my proofs, in-browser verification, downloads |
| `src/app/audit/…` | auditor workspace: read-only across granted organisations, pack re-verification |
| `src/app/p/[slug]/…` | public transparency page and public documents |
| `src/app/api/v1/…` | API-key routes: publications, custody, coverage, files |
| `src/lib/publications.ts`, `custody.ts`, `coverage.ts` | the three publish paths, shared by pages and API |
| `src/lib/service.ts` | the only client of the signing service |
| `src/lib/simulator.ts`, `simulator-input.ts` | the only client of the transaction simulator (`rust/sim-server`), and the pure input parser behind its form |
| `src/lib/rbac.ts` | roles and access checks |
| `messages/*.json` | English and Simplified Chinese |
| `prisma/schema.prisma` | tenancy, documents as signed, access |

## Checks

```bash
npm test          # vitest
npm run typecheck # tsc
npm run lint      # eslint
npm run build     # next build (standalone output)
```

`scripts/check.sh web` at the repository root runs all of them the way CI does.
