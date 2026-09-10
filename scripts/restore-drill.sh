#!/usr/bin/env bash
#
# Restore drill: prove that a database dump, a keystore archive and the
# SERVICE_KEK are enough to bring the console back — on an isolated copy,
# without touching the running deployment.
#
# Usage:
#   scripts/restore-drill.sh --db backup.sql --keystore keystore.tgz \
#       (--kek-file kek.hex | --env-file .env) \
#       [--web-image IMG --service-image IMG] [--port 3100] [--keep]
#
# Inputs are the three things DEPLOY.md §6 says to back up:
#   --db          plain-SQL dump: `docker compose exec db pg_dump -U canton canton`
#   --keystore    tar.gz of the keystore volume (the sealed per-organisation seeds)
#   --kek-file    a file holding the 64-hex SERVICE_KEK (your off-machine copy), or
#   --env-file    an env file that contains SERVICE_KEK=…  (repeatable)
#
# The KEK is the only production secret the drill needs. The drill database,
# its password, the service token and the session secret are fresh, local to
# the drill, and thrown away with it.
#
# Images: with --web-image/--service-image the drill runs the same prebuilt
# images production runs (a registry deployment); without them it builds from
# this repository like the repository's docker-compose.yml does.
#
# The drill runs its own compose project (`cal-drill`, its own volumes, its
# own port), restores into it, then checks three things:
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
# Exit status: 0 PASS, 1 FAIL, 2 INCONCLUSIVE (nothing published yet, so the
# key check had nothing to compare).
#
# Everything the drill creates is removed at the end unless --keep is given.
# It never reads or writes the production project's volumes.

set -euo pipefail

DB_DUMP=""
KEYSTORE_TGZ=""
KEK_FILE=""
ENV_FILES=()
WEB_IMAGE=""
SERVICE_IMAGE=""
PORT=3100
KEEP=0
PROJECT="cal-drill"
REPO=$(cd "$(dirname "$0")/.." && pwd)

while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB_DUMP="$2"; shift 2 ;;
    --keystore) KEYSTORE_TGZ="$2"; shift 2 ;;
    --kek-file) KEK_FILE="$2"; shift 2 ;;
    --env-file) ENV_FILES+=("$2"); shift 2 ;;
    --web-image) WEB_IMAGE="$2"; shift 2 ;;
    --service-image) SERVICE_IMAGE="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,47p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

fail() { echo "FAIL: $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

[ -n "$DB_DUMP" ] && [ -f "$DB_DUMP" ] || fail "--db must name the pg_dump file"
[ -n "$KEYSTORE_TGZ" ] && [ -f "$KEYSTORE_TGZ" ] || fail "--keystore must name the keystore archive"
command -v docker >/dev/null || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "the docker compose plugin is not installed"
command -v curl >/dev/null || fail "curl is not installed"
if [ -n "$WEB_IMAGE" ] || [ -n "$SERVICE_IMAGE" ]; then
  [ -n "$WEB_IMAGE" ] && [ -n "$SERVICE_IMAGE" ] || fail "--web-image and --service-image go together"
else
  [ -f "$REPO/web/Dockerfile" ] && [ -f "$REPO/rust/solvency-service/Dockerfile" ] || fail "no images given and $REPO is not the repository (nothing to build from)"
fi

# The one production secret: the KEK. Never printed.
SERVICE_KEK=""
if [ -n "$KEK_FILE" ]; then
  [ -f "$KEK_FILE" ] || fail "--kek-file $KEK_FILE not found"
  SERVICE_KEK=$(tr -d '[:space:]' < "$KEK_FILE")
else
  [ ${#ENV_FILES[@]} -gt 0 ] || fail "give --kek-file or --env-file"
  for f in "${ENV_FILES[@]}"; do
    [ -f "$f" ] || fail "--env-file $f not found"
    v=$(sed -n 's/^SERVICE_KEK=//p' "$f" | head -1 | sed 's/^"\(.*\)"$/\1/')
    [ -n "$v" ] && SERVICE_KEK="$v"
  done
fi
printf '%s' "$SERVICE_KEK" | grep -Eq '^[0-9a-fA-F]{64}$' || fail "SERVICE_KEK is not 64 hex characters; that is the key the drill exists to test"

# Everything else is local to the drill.
DRILL_TOKEN=$(head -c 36 /dev/urandom | base64 | tr -d '/+=' | head -c 40)
DRILL_AUTH=$(head -c 36 /dev/urandom | base64 | tr -d '/+=' | head -c 40)
DRILL_DB_PW=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)

WORK=$(mktemp -d)
chmod 700 "$WORK"

cleanup() {
  if [ "$KEEP" -eq 1 ]; then
    echo
    echo "kept: docker compose -p $PROJECT ps   (remove with: docker compose -p $PROJECT -f $WORK/docker-compose.yml down -v)"
  else
    step "Removing the drill project and its volumes"
    docker compose -p "$PROJECT" -f "$WORK/docker-compose.yml" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

# A compose file of the drill's own, so the drill does not depend on how the
# production copy was deployed (repository compose, a registry deployment, …).
if [ -n "$WEB_IMAGE" ]; then
  WEB_SRC="    image: $WEB_IMAGE"
  SERVICE_SRC="    image: $SERVICE_IMAGE"
else
  WEB_SRC="    build: {context: $REPO, dockerfile: web/Dockerfile}"
  SERVICE_SRC="    build: {context: $REPO, dockerfile: rust/solvency-service/Dockerfile}"
fi
cat > "$WORK/docker-compose.yml" <<EOF
name: $PROJECT
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: canton
      POSTGRES_PASSWORD: $DRILL_DB_PW
      POSTGRES_DB: canton
    volumes: [db-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U canton -d canton"]
      interval: 3s
      timeout: 3s
      retries: 30
  service:
$SERVICE_SRC
    environment:
      SERVICE_TOKEN: $DRILL_TOKEN
      SERVICE_KEK: $SERVICE_KEK
      BIND: 0.0.0.0:8790
      KEYSTORE_DIR: /var/lib/canton/keystore
    volumes: [keystore:/var/lib/canton/keystore]
  web:
$WEB_SRC
    depends_on:
      db: {condition: service_healthy}
      service: {condition: service_started}
    environment:
      DATABASE_URL: postgresql://canton:$DRILL_DB_PW@db:5432/canton
      AUTH_SECRET: $DRILL_AUTH
      AUTH_URL: http://localhost:$PORT
      AUTH_TRUST_HOST: "true"
      SERVICE_URL: http://service:8790
      SERVICE_TOKEN: $DRILL_TOKEN
      MAGIC_LINK_LOG: "1"
    ports: ["127.0.0.1:$PORT:3000"]
volumes:
  db-data:
  keystore:
EOF
chmod 600 "$WORK/docker-compose.yml"

compose() { docker compose -p "$PROJECT" -f "$WORK/docker-compose.yml" "$@"; }

if docker compose -p "$PROJECT" ps -q 2>/dev/null | grep -q .; then
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
compose up -d --quiet-pull db >/dev/null 2>&1
for _ in $(seq 1 40); do
  compose exec -T db pg_isready -U canton -d canton >/dev/null 2>&1 && break
  sleep 2
done
compose exec -T db pg_isready -U canton -d canton >/dev/null 2>&1 || fail "database did not become ready"

step "Restoring the database dump"
compose exec -T db psql -q -v ON_ERROR_STOP=1 -U canton -d canton < "$DB_DUMP" >/dev/null
RESTORED_ORGS=$(compose exec -T db psql -tA -U canton -d canton -c 'SELECT count(*) FROM "Organization"' | tr -d '[:space:]')
RESTORED_PUBS=$(compose exec -T db psql -tA -U canton -d canton -c 'SELECT count(*) FROM "Publication"' | tr -d '[:space:]')
echo "restored $RESTORED_ORGS organisation(s), $RESTORED_PUBS publication(s)"
[ "$RESTORED_ORGS" = "$DUMP_ORGS" ] || fail "organisation count differs from the dump ($RESTORED_ORGS vs $DUMP_ORGS)"
[ "$RESTORED_PUBS" = "$DUMP_PUBS" ] || fail "publication count differs from the dump ($RESTORED_PUBS vs $DUMP_PUBS)"

step "Restoring the keystore archive into the drill volume"
KS_DIR=$(cd "$(dirname "$KEYSTORE_TGZ")" && pwd)
KS_NAME=$(basename "$KEYSTORE_TGZ")
# Let compose create the service container and its volume so the volume is
# its own; the archive has to be in place before the service first opens it.
compose create --quiet-pull service >/dev/null 2>&1
docker run --rm -v "${PROJECT}_keystore:/k" -v "$KS_DIR:/b:ro" alpine sh -c "tar xzf /b/$KS_NAME -C /k && chmod -R a+rwX /k"
KEY_FILES=$(docker run --rm -v "${PROJECT}_keystore:/k:ro" alpine sh -c 'ls /k/*.key 2>/dev/null | wc -l' | tr -d '[:space:]')
echo "keystore holds $KEY_FILES sealed key(s)"

step "Starting the signing service and the console"
if [ -n "$WEB_IMAGE" ]; then compose up -d --quiet-pull service web >/dev/null 2>&1; else compose up -d --build service web >/dev/null 2>&1; fi
HEALTH=""
for _ in $(seq 1 90); do
  HEALTH=$(curl -s "http://127.0.0.1:$PORT/api/health" || true)
  echo "$HEALTH" | grep -q '"status":"ok"' && break
  sleep 2
done
echo "$HEALTH"
echo "$HEALTH" | grep -q '"db":"ok"' || fail "the console does not see the restored database (docker compose -p $PROJECT logs web)"
echo "$HEALTH" | grep -q '"signingService":"ok"' || fail "the console does not reach the signing service — SERVICE_KEK is probably not valid for it (docker compose -p $PROJECT logs service)"

step "Checking that the restored keystore reproduces every organisation's signing key"
MISMATCH=0
CHECKED=0
while IFS='|' read -r ORG_ID SLUG KEY; do
  [ -n "$ORG_ID" ] || continue
  RESP=$(compose exec -T web wget -qO- \
    --header="authorization: Bearer $DRILL_TOKEN" \
    --header="content-type: application/json" \
    --post-data="{\"org_id\":\"$ORG_ID\"}" \
    http://service:8790/keys 2>/dev/null || true)
  GOT=$(printf '%s' "$RESP" | sed -n 's/.*"public_key":"\([0-9a-f]*\)".*/\1/p')
  CHECKED=$((CHECKED + 1))
  if [ -n "$GOT" ] && [ "$GOT" = "$KEY" ]; then
    echo "  ok       $SLUG  ${KEY:0:16}…"
  else
    echo "  MISMATCH $SLUG  recorded ${KEY:0:16}…  restored service says ${GOT:-<no answer>}"
    MISMATCH=$((MISMATCH + 1))
  fi
done < <(compose exec -T db psql -tA -U canton -d canton -c 'SELECT id, slug, "signingKeyHex" FROM "Organization" WHERE "signingKeyHex" IS NOT NULL ORDER BY slug' | tr -d '\r')
if [ "$CHECKED" -eq 0 ]; then
  echo
  echo "INCONCLUSIVE: the database and keystore restored and the console came up, but no organisation has a"
  echo "              recorded signing key yet, so the keystore + SERVICE_KEK check had nothing to compare."
  echo "              Run the drill again after the first publication; that is when a wrong key would matter."
  exit 2
fi
[ "$MISMATCH" -eq 0 ] || fail "$MISMATCH of $CHECKED organisation(s) would get a NEW key after this restore. The keystore archive or SERVICE_KEK does not match what is in production. Do not rely on these backups."

echo
echo "PASS: database restored ($RESTORED_ORGS orgs, $RESTORED_PUBS publications); keystore + SERVICE_KEK reproduce all $CHECKED signing key(s)."
