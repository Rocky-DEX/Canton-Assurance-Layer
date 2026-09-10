# Deploying the Canton Assurance Layer

English | [简体中文](DEPLOY.zh-CN.md)

Everything runs on one machine with Docker: Postgres, the signing service,
the console, and (optionally) the transaction simulator. Nothing calls out to
Rocky or to any cloud service. Your keys stay in a volume on your machine,
sealed under a key you generate.

What you are deploying:

| Container | What it does | Port |
|---|---|---|
| `db` | Postgres 17: organisations, members, documents as signed | internal |
| `service` | The signing service (`rust/solvency-service`): the only process that holds signing seeds; builds trees, signs reports, writes proofs | internal 8790 |
| `web` | The console (`web/`): publisher workspace, customer portal, auditor workspace, public transparency page | 3000 |
| `simulator` | Optional (`rust/sim-server`): the transaction simulator behind the Simulator page; needs a Canton participant | 8787 |

## 1. Prerequisites

- A Linux host (or a Mac for trying it out) with **Docker 24+** and the
  `docker compose` plugin. 2 CPUs and 4 GB of RAM are enough; the first build
  compiles Rust and Next.js and takes 10–20 minutes on a small machine.
- A domain name pointing at the host, if anyone other than you will use it.
  Sign-in links are sent to that domain.
- An SMTP account for sign-in emails — or use the log-based bootstrap in
  step 4 and add SMTP later.

## 2. Configure

```bash
git clone https://github.com/Rocky-DEX/Canton-Assurance-Layer.git
cd Canton-Assurance-Layer
cp .env.compose.example .env
```

Fill in `.env`. Generate the secrets; do not invent them:

```bash
openssl rand -hex 32        # -> SERVICE_KEK      (exactly 64 hex characters)
openssl rand -base64 48     # -> SERVICE_TOKEN    (run again for AUTH_SECRET and POSTGRES_PASSWORD)
```

| Variable | What it is |
|---|---|
| `POSTGRES_PASSWORD` | Database password; only the containers see it |
| `SERVICE_TOKEN` | Shared secret between the console and the signing service, 32+ characters |
| `SERVICE_KEK` | The key that seals every organisation's signing seed at rest. **Back it up. Without it, existing seeds cannot be opened** |
| `AUTH_SECRET` | Signs session cookies |
| `AUTH_URL` | The public URL of the console, e.g. `https://assurance.example.com`. Sign-in links point here |
| `WEB_PORT` | Host port for the console (default 3000) |
| `EMAIL_SERVER`, `EMAIL_FROM` | SMTP for sign-in links, e.g. `smtp://user:pass@smtp.example.com:587` |
| `MAGIC_LINK_LOG` | Set to `1` to print sign-in links to the `web` container's log instead of mailing them (bootstrap only, see step 4) |
| `CANTON_SIM_*` | Only for the simulator profile: a participant's JSON Ledger API URL and a read-only token |

The console checks this file when it starts and refuses to run with a
missing or placeholder value; the message in `docker compose logs web` names
the variable.

## 3. Start

```bash
docker compose up -d --build
docker compose ps                 # all three "healthy" after about a minute
curl -s localhost:3000/api/health # {"status":"ok","db":"ok","signingService":"ok",...}
```

Database migrations run automatically when the `web` container starts.

## 4. First sign-in

The console has no admin password. Every account signs in with a link sent
to its email, and the first person to create an organisation becomes its
owner.

**With SMTP configured:** open `http://<host>:3000/login`, enter your email,
click the link in the mail.

**Without SMTP yet:** set `MAGIC_LINK_LOG=1` in `.env`, run
`docker compose up -d web`, request a link at `/login`, then:

```bash
docker compose logs web | grep "magic link"
```

Open the printed URL. Anyone who can read that log can sign in as anyone, so
remove `MAGIC_LINK_LOG` and configure `EMAIL_SERVER` before inviting others.

Then: **Create organisation** → name, URL slug, and the Canton party that
publishes. The getting-started checklist on the overview page walks through
the first publication; the samples it links to are enough to see every
screen before you prepare real files.

## 5. Put it behind TLS

Publish the console only through a reverse proxy with TLS; session cookies
and sign-in links must not travel in clear. With [Caddy](https://caddyserver.com/)
this is the whole configuration:

```
assurance.example.com {
    reverse_proxy localhost:3000
}
```

Set `AUTH_URL=https://assurance.example.com` and `WEB_PORT=3000` bound to
localhost only if you prefer (`127.0.0.1:3000:3000` in `docker-compose.yml`).
The signing service and the database are never published; only the `web`
container talks to them.

## 6. Back up

Three things, and the third is the one people forget:

| What | Where | How |
|---|---|---|
| Database | volume `db-data` | `docker compose exec db pg_dump -U canton canton > backup.sql` |
| Sealed signing seeds | volume `keystore` | `docker run --rm -v canton-assurance-layer_keystore:/k -v "$PWD":/out alpine tar czf /out/keystore.tgz -C /k .` |
| The key that opens them | `SERVICE_KEK` in `.env` | keep it where you keep secrets, separately from the keystore archive |

**If the keystore or `SERVICE_KEK` is lost, the organisations cannot sign
new reports.** Everything already published stays verifiable forever — the
public keys are in the reports and anchors — but the publisher would have to
start a new key, and readers would see the key change in the anchor history.
That is the design: a key that cannot be quietly replaced is the point.

Restore: recreate the volumes, `psql < backup.sql`, untar the keystore, put
the same `SERVICE_KEK` in `.env`, `docker compose up -d`.

### Restore drill

A backup nobody has restored is a hope. Run the drill after the first
deployment and then every quarter, and after any change to `.env`:

```bash
docker compose exec db pg_dump -U canton canton > backup.sql
docker run --rm -v canton-assurance-layer_keystore:/k -v "$PWD":/out alpine tar czf /out/keystore.tgz -C /k .
scripts/restore-drill.sh --db backup.sql --keystore keystore.tgz --env-file .env
```

The KEK is the only production secret the drill reads; `--kek-file` takes it
from a file instead of `.env` — use your off-machine copy, so the drill also
proves that copy is right. A deployment that runs prebuilt images rather
than building from the repository passes them with `--web-image` and
`--service-image`, and the drill runs the same images production runs.
Exit status 0 is `PASS`, 1 `FAIL`, 2 `INCONCLUSIVE` (nothing published yet,
so there was no key to compare).

It brings up a second, isolated copy (compose project `cal-drill`, its own
volumes, port 3100), restores the dump and the keystore into it, and checks
that the row counts match the dump and — the part that matters — that the
restored signing service, opening the restored keystore with your
`SERVICE_KEK`, reproduces every organisation's recorded public key. A wrong
key or archive would not make the service fail; it would silently mint a
new key for each organisation, and the next report would be signed by a key
every reader sees change. The drill ends with `PASS` or a `FAIL` line that
says which of the three inputs is wrong, and removes everything it created
(`--keep` to inspect). Run it on the production host or on any machine with
Docker and the three files; it never touches the production project.

## 7. Upgrade

```bash
git pull
docker compose up -d --build
```

Migrations run on start. Documents already published are never rewritten:
the wire format is versioned by the domain strings inside every hash, and a
new version ships alongside the old one, never in place of it
(`CHANGELOG.md` says so for each release). A report signed last year
verifies today.

## 8. The simulator (optional)

The Simulator page dry-runs Ledger API commands on a Canton participant. It
needs the participant's JSON Ledger API and a **read-only** token; it never
submits and never holds keys.

```bash
# in .env
CANTON_SIM_LEDGER_URL=https://validator.example/api/json-api
CANTON_SIM_TOKEN=...          # or CANTON_SIM_TOKEN_FILE with a mounted file
CANTON_SIM_SCAN_URL=https://scan.sv-1.global.canton.network.sync.global   # live fee pricing

docker compose --profile simulator up -d --build
```

Without a participant the page still explains error codes and estimates
fees; simulations come back "inconclusive".

## 9. What to watch

- `GET /api/health` on the console: `db`, `signingService` and `simulator`
  each `ok` or `down`; 503 when the console cannot do its job. Point your
  uptime monitor at it.
- `docker compose ps`: the healthchecks restart nothing by themselves, but
  `restart: unless-stopped` brings a crashed container back.
- The audit log inside each organisation (Settings → members and API keys,
  and every publish, custody and simulation call) is in the database; back
  it up with the rest.

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `web` exits immediately, log says `[config] error: …` | A required variable is missing or a placeholder | Set the named variable in `.env`, `docker compose up -d web` |
| Sign-in link never arrives | `EMAIL_SERVER` wrong or unset | Check `docker compose logs web`; use `MAGIC_LINK_LOG=1` to bootstrap |
| Sign-in link opens the wrong host | `AUTH_URL` does not match the URL in the browser | Set it to the public URL, including `https://` |
| `signingService: "down"` in `/api/health` | `SERVICE_TOKEN` differs between containers, or `SERVICE_KEK` is not 64 hex chars | `docker compose logs service` says which |
| "ledger offset … moves backwards" when publishing | The offset is smaller than the previous publication's | Use the "previous + 1" button, or your real, larger offset |
| Publishing fails with "signing key changed for …" | The signing service holds a different seed for this organisation than the one on record: the keystore volume or `SERVICE_KEK` was lost or restored wrongly, and the service minted a new key | Nothing was published. Restore the keystore and `SERVICE_KEK` from backup and run the drill; never carry on with the new key unless you mean to rotate |
| Simulator page says not reachable | The `simulator` profile is not up, or `CANTON_SIM_LEDGER_URL` is wrong | `docker compose --profile simulator up -d`; check its log |

Security issues: see [SECURITY.md](SECURITY.md). Everything else:
[GitHub issues](https://github.com/Rocky-DEX/Canton-Assurance-Layer/issues).
