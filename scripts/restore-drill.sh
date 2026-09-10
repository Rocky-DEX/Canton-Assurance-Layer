#!/usr/bin/env bash
#
# Restore drill: prove that a database dump, a keystore archive and the
# SERVICE_KEK in an env file are enough to bring the console back — on an
# isolated copy, without touching the running deployment.
#
# Usage:
#   scripts/restore-drill.sh --db backup.sql --keystore keystore.tgz [--env-file .env] [--port 3100] [--keep]
#
# Inputs are the three things DEPLOY.md §6 says to back up:
#   --db        plain-SQL dump from `docker compose exec db pg_dump -U canton canton`
#   --keystore  tar.gz of the keystore volume (the sealed per-organisation seeds)
#   --env-file  the file holding SERVICE_KEK, SERVICE_TOKEN, POSTGRES_PASSWORD,
#               AUTH_SECRET (default: .env). Only those four are read.
#
# The drill runs a second compose project named `cal-drill` with its own
# volumes and its own port, restores into it, then checks three things:
#
#   1. The console comes up and reports the database and signing service ok.
#   2. Row counts for organisations and publications equal what the dump holds.
#   3. For every organisation with a recorded signing key, the restored
#      signing service — opening the restored keystore with the given KEK —
#      reproduces exactly that public key.
#
# Check 3 is the one that matters. If the keystore or the KEK were wrong, the
# service would not error: it would mint a fresh seed for the organisation,
# and the next report would be signed by a new key that every reader sees
# change in the anchor history. A drill that only checked "it starts" would
# call that a success.
#
# Everything the drill creates is removed at the end unless --keep is given.
# It never reads or writes the production project's volumes.

set -euo pipefail

DB_DUMP=""
KEYSTORE_TGZ=""
ENV_FILE=".env"
PORT=3100
KEEP=0
PROJECT="cal-drill"

while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB_DUMP="$2"; shift 2 ;;
    --keystore) KEYSTORE_TGZ="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,36p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

fail() { echo "FAIL: $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

[ -n "$DB_DUMP" ] && [ -f "$DB_DUMP" ] || fail "--db must name the pg_dump file"
[ -n "$KEYSTORE_TGZ" ] && [ -f "$KEYSTORE_TGZ" ] || fail "--keystore must name the keystore archive"
[ -f "$ENV_FILE" ] || fail "--env-file $ENV_FILE not found"
command -v docker >/dev/null || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "the docker compose plugin is not installed"
cd "$(dirname "$0")/.."

# Only the secrets the restore needs; everything else is set for the drill.
read_var() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | sed 's/^"\(.*\)"$/\1/'; }
SERVICE_KEK=$(read_var SERVICE_KEK)
SERVICE_TOKEN=$(read_var SERVICE_TOKEN)
POSTGRES_PASSWORD=$(read_var POSTGRES_PASSWORD)
AUTH_SECRET=$(read_var AUTH_SECRET)
[ ${#SERVICE_KEK} -eq 64 ] || fail "SERVICE_KEK in $ENV_FILE is not 64 hex characters; that is the key the drill exists to test"
[ -n "$SERVICE_TOKEN" ] && [ -n "$POSTGRES_PASSWORD" ] && [ -n "$AUTH_SECRET" ] || fail "SERVICE_TOKEN, POSTGRES_PASSWORD and AUTH_SECRET must be set in $ENV_FILE"

DRILL_ENV=$(mktemp)
trap 'rm -f "$DRILL_ENV"' EXIT
cat > "$DRILL_ENV" <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
SERVICE_TOKEN=$SERVICE_TOKEN
SERVICE_KEK=$SERVICE_KEK
AUTH_SECRET=$AUTH_SECRET
AUTH_URL=http://localhost:$PORT
WEB_PORT=$PORT
EMAIL_SERVER=
MAGIC_LINK_LOG=1
EOF

compose() { docker compose -p "$PROJECT" --env-file "$DRILL_ENV" "$@"; }

cleanup() {
  if [ "$KEEP" -eq 1 ]; then
    echo
    echo "kept: docker compose -p $PROJECT ps   (remove with: docker compose -p $PROJECT down -v)"
  else
    step "Removing the drill project and its volumes"
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -f "$DRILL_ENV"
}
trap cleanup EXIT

if compose ps -q 2>/dev/null | grep -q .; then
  fail "a $PROJECT project is already running; remove it first: docker compose -p $PROJECT down -v"
fi

# What the dump holds, so the restored counts have something to be compared with.
count_in_dump() {
  awk -v table="COPY public.\"$1\"" '
    index($0, table) == 1 { inside = 1; next }
    inside && $0 == "\\." { inside = 0; next }
    inside { n++ }
    END { print n + 0 }' "$DB_DUMP"
}
DUMP_ORGS=$(count_in_dump Organization)
DUMP_PUBS=$(count_in_dump Publication)
echo "dump holds $DUMP_ORGS organisation(s), $DUMP_PUBS publication(s)"

step "Starting an empty database for project $PROJECT"
compose up -d db >/dev/null
for _ in $(seq 1 30); do
  compose exec -T db pg_isready -U canton -d canton >/dev/null 2>&1 && break
  sleep 2
done
compose exec -T db pg_isready -U canton -d canton >/dev/null 2>&1 || fail "database did not become ready"

step "Restoring the database dump"
compose exec -T db psql -q -v ON_ERROR_STOP=1 -U canton -d canton < "$DB_DUMP" >/dev/null
RESTORED_ORGS=$(compose exec -T db psql -tA -U canton -d canton -c 'SELECT count(*) FROM "Organization"')
RESTORED_PUBS=$(compose exec -T db psql -tA -U canton -d canton -c 'SELECT count(*) FROM "Publication"')
echo "restored $RESTORED_ORGS organisation(s), $RESTORED_PUBS publication(s)"
[ "$RESTORED_ORGS" = "$DUMP_ORGS" ] || fail "organisation count differs from the dump ($RESTORED_ORGS vs $DUMP_ORGS)"
[ "$RESTORED_PUBS" = "$DUMP_PUBS" ] || fail "publication count differs from the dump ($RESTORED_PUBS vs $DUMP_PUBS)"

step "Restoring the keystore archive into the drill volume"
KS_DIR=$(cd "$(dirname "$KEYSTORE_TGZ")" && pwd)
KS_NAME=$(basename "$KEYSTORE_TGZ")
# Create the volume by starting nothing: `compose up` below would make it, but
# the archive has to be in place before the service first opens the directory.
docker volume create "${PROJECT}_keystore" >/dev/null
docker run --rm -v "${PROJECT}_keystore:/k" -v "$KS_DIR:/b:ro" alpine sh -c "tar xzf /b/$KS_NAME -C /k && chmod -R u+rwX /k"
KEY_FILES=$(docker run --rm -v "${PROJECT}_keystore:/k:ro" alpine sh -c 'ls /k/*.key 2>/dev/null | wc -l')
echo "keystore holds $KEY_FILES sealed key(s)"

step "Starting the signing service and the console"
compose up -d --build service web >/dev/null
HEALTH=""
for _ in $(seq 1 60); do
  HEALTH=$(curl -s "http://127.0.0.1:$PORT/api/health" || true)
  echo "$HEALTH" | grep -q '"status":"ok"' && break
  sleep 2
done
echo "$HEALTH"
echo "$HEALTH" | grep -q '"db":"ok"' || fail "the console does not see the restored database"
echo "$HEALTH" | grep -q '"signingService":"ok"' || fail "the console does not reach the signing service (SERVICE_TOKEN or SERVICE_KEK is wrong — see: docker compose -p $PROJECT logs service)"

step "Checking that the restored keystore reproduces every organisation's signing key"
MISMATCH=0
CHECKED=0
while IFS='|' read -r ORG_ID SLUG KEY; do
  [ -n "$ORG_ID" ] || continue
  RESP=$(compose exec -T web wget -qO- \
    --header="authorization: Bearer $SERVICE_TOKEN" \
    --header="content-type: application/json" \
    --post-data="{\"org_id\":\"$ORG_ID\"}" \
    http://service:8790/keys 2>/dev/null || true)
  GOT=$(printf '%s' "$RESP" | sed -n 's/.*"public_key":"\([0-9a-f]*\)".*/\1/p')
  CHECKED=$((CHECKED + 1))
  if [ "$GOT" = "$KEY" ]; then
    echo "  ok       $SLUG  ${KEY:0:16}…"
  else
    echo "  MISMATCH $SLUG  expected ${KEY:0:16}… got ${GOT:0:16}…"
    MISMATCH=$((MISMATCH + 1))
  fi
done < <(compose exec -T db psql -tA -U canton -d canton -c 'SELECT id, slug, "signingKeyHex" FROM "Organization" WHERE "signingKeyHex" IS NOT NULL ORDER BY slug')
[ "$CHECKED" -gt 0 ] || fail "no organisation has a recorded signing key; nothing to compare (has anything been published?)"
[ "$MISMATCH" -eq 0 ] || fail "$MISMATCH of $CHECKED organisation(s) would get a NEW key after this restore. The keystore archive or SERVICE_KEK does not match what is in production. Do not rely on these backups."

echo
echo "PASS: database restored ($RESTORED_ORGS orgs, $RESTORED_PUBS publications), keystore + SERVICE_KEK reproduce all $CHECKED signing key(s)."
echo "      Backups taken $(date -r "$DB_DUMP" '+%Y-%m-%d %H:%M' 2>/dev/null || stat -c %y "$DB_DUMP" 2>/dev/null | cut -c1-16) (db) and $(date -r "$KEYSTORE_TGZ" '+%Y-%m-%d %H:%M' 2>/dev/null || stat -c %y "$KEYSTORE_TGZ" 2>/dev/null | cut -c1-16) (keystore) can restore this deployment."
