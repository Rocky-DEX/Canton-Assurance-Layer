# The hosted console (Next.js). Built from the repository root so the verifier
# source in ts/verifier and the offline page are part of the image:
#
#   docker build -f web/Dockerfile -t canton-assurance-web .

FROM node:24-alpine AS deps
WORKDIR /repo
COPY ts/verifier/package.json ts/verifier/package-lock.json ts/verifier/
COPY web/package.json web/package-lock.json web/
COPY web/prisma web/prisma
RUN cd web && npm ci --ignore-scripts

FROM node:24-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/web/node_modules web/node_modules
COPY ts/verifier ts/verifier
COPY offline offline
COPY web web
ENV NEXT_TELEMETRY_DISABLED=1
# A placeholder so Prisma can generate; the real URL arrives at runtime.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN cd web && npx prisma generate && npm run build
# The Prisma CLI the entrypoint runs for `migrate deploy`, installed on its
# own with its whole dependency closure (@prisma/engines, @prisma/config and
# what they pull in). Copying node_modules/prisma alone from the build stage
# left that closure behind and the container crash-looped on the first
# migration. Pinned to the version the lockfile resolved so the CLI and the
# generated client cannot drift apart.
RUN mkdir -p /opt/prisma-cli && cd /opt/prisma-cli && npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund "prisma@$(node -p "require('/repo/web/node_modules/prisma/package.json').version")" \
  && node /opt/prisma-cli/node_modules/prisma/build/index.js --version
# `--version` makes the CLI fetch its engines now, at build time, in case the
# base image's npm skipped install scripts; a runtime with no network must
# not be the first to try.

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo/web/.next/standalone ./
COPY --from=build /repo/web/.next/static ./web/.next/static
COPY --from=build /repo/web/public ./web/public
COPY --from=build /repo/web/prisma ./web/prisma
COPY --from=build /opt/prisma-cli /opt/prisma-cli
COPY offline ./web/offline
COPY web/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R app:app /app
USER app
WORKDIR /app/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
