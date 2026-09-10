#!/usr/bin/env bash
#
# Everything CI runs, in one command.
#
# CI invokes this script rather than repeating its steps, so "it passed
# locally" means "it will pass CI" by construction rather than by someone
# keeping two lists in step. CONTRIBUTING.md used to enumerate the commands and
# claim CI ran exactly them; it had drifted to three crates out of four, with
# no rustdoc, no spec audit and no Daml.
#
# Usage:
#   scripts/check.sh          # everything available
#   scripts/check.sh rust     # one section: rust | ts | web | audit | daml
#
# Sections whose toolchain is absent are skipped with a notice rather than
# failing, so a contributor without the Daml SDK can still check the rest. CI
# installs everything, so nothing is skipped there.

set -uo pipefail

cd "$(dirname "$0")/.."

# One workspace (rust/Cargo.toml); the loop keeps per-crate labels so a failure
# names the crate. The sim-* crates are the canton-sim transaction simulator.
CRATES=(solvency-merkle solvency-report solvency-cli reserve-attest solvency-service
        sim-proto sim-diagnose sim-fee sim-core sim-cli sim-server)
failures=()
skipped=()

run() {
  local label="$1"
  shift
  printf '  %-46s' "$label"
  if output=$("$@" 2>&1); then
    echo "ok"
  else
    echo "FAILED"
    failures+=("$label")
    printf '%s\n' "$output" | tail -25 | sed 's/^/      /'
  fi
}

section_rust() {
  echo "Rust"
  for crate in "${CRATES[@]}"; do
    local manifest="rust/$crate/Cargo.toml"
    run "$crate: test" cargo test --quiet --manifest-path "$manifest"
    # `--` ends cargo's own flags, so anything after it goes to rustc. Putting
    # --quiet there makes every invocation fail regardless of the code, which
    # is a check that carries no information and cost me a red CI run.
    run "$crate: clippy" cargo clippy --quiet --manifest-path "$manifest" --all-targets -- -D warnings
    run "$crate: fmt" cargo fmt --manifest-path "$manifest" --check
    run "$crate: rustdoc" env RUSTDOCFLAGS="-D warnings" cargo doc --quiet --no-deps --manifest-path "$manifest"
  done
  # The simulator's offline subcommands need no participant, so they double as
  # a smoke test of the built binary.
  run "canton-sim: build" cargo build --quiet --manifest-path rust/Cargo.toml -p canton-sim -p canton-sim-server
  run "canton-sim: explain" rust/target/debug/canton-sim explain CONTRACT_NOT_FOUND
  run "canton-sim: fee" rust/target/debug/canton-sim fee --request-bytes 4000 --response-bytes 500
  run "canton-sim: catalog" sh -c 'rust/target/debug/canton-sim catalog --filter DAML_ | grep -q DAML_AUTHORIZATION_ERROR'
}

section_ts() {
  echo "TypeScript"
  if ! command -v npm >/dev/null; then
    skipped+=("TypeScript (npm not installed)")
    return
  fi
  run "npm install" npm --prefix ts/verifier install --silent
  run "npm test" npm --prefix ts/verifier test
  run "tsc --noEmit" npx --prefix ts/verifier tsc --noEmit --project ts/verifier
}

section_web() {
  echo "Web console"
  if ! command -v npm >/dev/null; then
    skipped+=("web console (npm not installed)")
    return
  fi
  run "npm ci" npm --prefix web ci --silent --ignore-scripts
  run "prisma generate" npx --prefix web prisma generate --schema web/prisma/schema.prisma
  run "npm test" npm --prefix web test
  # Route prop types (PageProps<"/app/[slug]/…">) are generated, so a fresh
  # checkout has none until typegen or build has run.
  run "next typegen" npx --prefix web next typegen web
  run "tsc --noEmit" npx --prefix web tsc --noEmit --project web
  run "eslint" npm --prefix web run lint
  # `next build` needs a DATABASE_URL to exist, not to connect; Prisma only
  # reads it. The offline verifier is served from the repository copy.
  run "next build" env DATABASE_URL="postgresql://build:build@localhost:5432/build" npm --prefix web run build
}

section_audit() {
  echo "Specification audit"
  if ! command -v python3 >/dev/null; then
    skipped+=("spec audit (python3 not installed)")
    return
  fi
  run "vectors reproduce from SPEC.md alone" python3 spec-audit/verify_from_spec.py
  run "compatibility statement rules" python3 spec-audit/test_statement.py
}

section_daml() {
  echo "Daml"
  if ! command -v daml >/dev/null; then
    skipped+=("Daml (SDK not installed — see .github/workflows/ci.yml)")
    return
  fi
  # CI used to cd into the project; --project-root is the documented
  # equivalent and keeps this script runnable from the repository root.
  run "daml build" daml build --project-root daml/solvency-anchor
  run "daml test" daml test --project-root daml/solvency-anchor
}

case "${1:-all}" in
  rust) section_rust ;;
  ts) section_ts ;;
  web) section_web ;;
  audit) section_audit ;;
  daml) section_daml ;;
  all) section_rust; section_ts; section_web; section_audit; section_daml ;;
  *) echo "unknown section: $1 (expected rust, ts, web, audit, daml, or all)" >&2; exit 2 ;;
esac

echo
for note in "${skipped[@]-}"; do
  [ -n "$note" ] && echo "skipped: $note"
done

if [ ${#failures[@]} -gt 0 ]; then
  echo "${#failures[@]} failed: ${failures[*]}"
  exit 1
fi
echo "all checks passed"
