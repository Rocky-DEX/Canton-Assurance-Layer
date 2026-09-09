# Hosted Disclosure Console (SaaS) — Design

**Date:** 2026-09-09
**Status:** implemented (2026-09-09); smoke-tested end to end against the CLI
**Milestone:** M4 (hosted instance + self-hostable build)

## Problem

Everything this project ships today is a file: a CLI, three self-contained
HTML pages, a Daml package. That is the right shape for *verification*, which
must never depend on anyone's server. It is the wrong shape for *operating*
disclosure: an institution's compliance team has no place to design, publish,
anchor and distribute reports quarter after quarter; a customer has no place to
find their own proof; an auditor has no place to see six venues side by side.

The README already commits to the answer — "a hosted instance and a
self-hostable build ship together" — and to the constraint that makes it
honest: **verification stays in the client; the server is a delivery
mechanism, never an authority.**

## Scope

**In:**

- **Publisher workspace.** An organisation with members and roles. Upload a
  balances CSV, design the disclosure manifest with a live audience preview
  and pre-publication diff, publish (report + one proof per customer + anchor
  linked to the previous one + signed evidence pack), attest custody from a
  saved active-contracts response, pair custody with liabilities into a
  coverage statement, browse history. Import a customer roster so proofs
  reach the right people. API keys so a nightly job can publish without a
  browser.
- **Customer portal.** A customer signs in, sees every venue that lists them,
  downloads each proof, and verifies it *in their browser* with the same
  provenance badges the offline page uses. The portal never receives the
  balance from anywhere but the proof file it just handed the customer.
- **Auditor workspace.** Read-only across every organisation that granted
  access: publications, coverage outcomes and assurance levels, anchor-chain
  integrity, evidence packs re-verified in the browser.
- **Public transparency page** per organisation: latest report summary,
  publisher key fingerprint, downloadable report and anchor history.
- Two languages (English, Simplified Chinese) throughout, sharing the
  vocabulary of the offline pages.
- One `docker compose up` for self-hosting: web, signing service, Postgres.

**Out, and why:**

- **Billing.** Not chosen for the first release.
- **Connecting a live participant node from the browser.** Still needs
  credentials only the institution holds; the custody path takes a saved
  response instead, exactly as `attest_from_json` does.
- **Daml anchoring from the service.** The anchor *document* is produced and
  chained; writing it to a ledger stays with the Daml package and the
  institution's node.
- **HSM/KMS signing.** The signing service isolates keys behind one process
  boundary and encrypts them at rest; swapping its keystore for a KMS is a
  later increment with the same interface.

## Architecture

```
browser ──── Next.js (web/) ──── Postgres
                 │
                 └── canton-solvency-service (rust/solvency-service)
                        ├── keystore: per-organisation Ed25519 seeds,
                        │   ChaCha20-Poly1305 under a KEK from the environment
                        └── wraps canton-solvency-report / reserve-attest:
                            publish, anchor, pack, custody, coverage statement
```

- **web/** — Next.js 16, App Router, TypeScript, Tailwind, Prisma 6 over
  Postgres, Auth.js (email magic link; OIDC/SAML later), next-intl. It owns
  tenancy, roles, storage of published documents, delivery, and the UI.
  Client-side verification imports `canton-solvency-verifier` from
  `ts/verifier` directly, so the SaaS cannot drift from the tested verifier.
- **rust/solvency-service** — axum. The only process that ever holds a
  signing seed. It takes leaves and metadata, returns signed documents. It
  keeps no tenancy state of its own beyond the keystore; web authenticates to
  it with a shared bearer token on an internal network.
- **Verification never moves server-side.** The web app stores and serves
  documents. Every "verified" badge a user sees was computed in their browser
  by the same modules the offline pages embed. The server may *summarise*
  (e.g. "3 of 3 assets covered") but labels such figures as the server's
  reading, and the page re-derives them client-side before calling them
  verified.

## Tenancy and roles

`Organization` ─< `Membership(role)` >─ `User`

| Role | Can |
|---|---|
| `OWNER` | everything, including deleting the organisation and rotating keys |
| `ADMIN` | members, customers, API keys, settings, publish |
| `OPERATOR` | upload, design, publish, attest |
| `AUDITOR` | read everything in the org, download packs; cannot publish |
| `VIEWER` | read summaries |

Customers are not members. A `Customer` row maps an organisation's external
`user_id` (the leaf identity in the CSV) to an email; when that email signs in,
the portal shows the proofs whose leaf `user_id` it maps to. An organisation
can grant an external auditor account read access with an `AuditorGrant`.

## Data model (Prisma)

Auth.js tables (`User`, `Account`, `Session`, `VerificationToken`), then:

- `Organization { id, slug, name, publisherParty, publicPage, signingKeyHex? }`
- `Membership { orgId, userId, role }`, `Invitation { orgId, email, role, token, expiresAt }`
- `Customer { orgId, externalId, email, userId? }`
- `Publication { orgId, profile, formatVersion, snapshotTime, ledgerOffset, reportDigest, rootHash, leafCount, rootSums, publisherKey, report, anchor, pack, manifest, previousId?, createdById }`
- `Proof { publicationId, externalId, document }`
- `CustodyReport { orgId, snapshotTime, ledgerOffset, reportDigest, report, positions }`
- `CoverageStatement { orgId, custodyId, publicationId, statement, outcome }`
- `ApiKey { orgId, name, prefix, hash, lastUsedAt, revokedAt }`
- `AuditorGrant { orgId, email, userId?, grantedById }`
- `AuditLog { orgId, actorId?, action, target, meta, at }`

Documents are stored as JSON exactly as signed. Nothing is ever re-serialised
before it is served: a byte that changes is a signature that fails.

## Signing service API

All routes require `Authorization: Bearer <SERVICE_TOKEN>`.

| Route | Purpose |
|---|---|
| `GET /health` | liveness |
| `POST /keys` `{ org_id }` | create or return the org's signing key; returns `public_key` |
| `POST /publish` | leaves + metadata (+ manifest, + previous anchor) → signed report, proofs, anchor, pack |
| `POST /custody` | active-contracts response + field names + metadata → signed `coverage.custody` report |

Coverage statements (SPEC §11) carry no signature of their own — they name
two signed reports by digest — so the web tier builds them with the verifier's
`reportDigestHex` and the service is not involved.

Amounts cross the boundary as 18dp decimal strings and are parsed with
`parse_amount_18dp`, the same function the CLI uses. The service never sees a
customer's email, name, or anything but the leaf identity the CSV carried.

## Console API (API keys)

Bearer `cal_…` keys act as the organisation with the operator role.

| Route | Purpose |
|---|---|
| `GET/POST /api/v1/orgs/{slug}/publications` | list; publish from JSON or a CSV body (`?snapshot_time&ledger_offset`) |
| `GET /api/v1/orgs/{slug}/publications/{id\|latest}` | metadata and file index |
| `GET /api/v1/orgs/{slug}/publications/{id\|latest}/files/{name}` | a document, exact bytes |
| `GET/POST /api/v1/orgs/{slug}/custody` | list; attest from a saved active-contracts response |
| `GET/POST /api/v1/orgs/{slug}/coverage` | list; pair a custody report with a publication |

## Failure modes named

- A publish that half-succeeds (report signed, proofs not stored) must not
  exist: web writes the publication and its proofs in one transaction after
  the service returns everything.
- A customer whose `user_id` is not in the roster still has a proof; it is
  stored, and appears the moment the roster maps them.
- Service unreachable → publishing is disabled with a visible reason, never
  silently queued.

## Testing

- Rust: unit tests over each handler with an in-process router; the keystore
  round-trips and refuses a wrong KEK.
- Web: vitest over CSV parsing, role checks, and the API-key hashing; the
  publish flow exercised end to end against embedded Postgres and the real
  service in CI.
- Every document the SaaS stores is verified by `canton-solvency-verify` in a
  test, so the hosted path cannot emit something the independent tool rejects.
