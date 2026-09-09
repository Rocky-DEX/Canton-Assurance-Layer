#!/bin/sh
# Apply pending migrations, then start. Migrations are idempotent, so a
# restart or a scaled-out replica racing another is harmless: Prisma takes an
# advisory lock and the loser sees nothing to do.
set -eu
if [ "${SKIP_MIGRATIONS:-}" != "1" ]; then
  node node_modules/prisma/build/index.js migrate deploy
fi
exec "$@"
