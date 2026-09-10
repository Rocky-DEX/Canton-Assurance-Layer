# The transaction simulator (canton-sim CLI and HTTP service). Built from the
# repository root so the workspace resolves:
#
#   docker build -f rust/sim-server/Dockerfile -t canton-sim .
#
# The image runs canton-sim-server; the CLI is on the path for `docker run
# --entrypoint canton-sim …`.

FROM rust:1.88-slim AS build
WORKDIR /repo
COPY rust rust
RUN cargo build --release --locked --manifest-path rust/Cargo.toml -p canton-sim -p canton-sim-server

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
  && useradd --system --home /var/lib/canton --create-home canton
COPY --from=build /repo/rust/target/release/canton-sim /usr/local/bin/canton-sim
COPY --from=build /repo/rust/target/release/canton-sim-server /usr/local/bin/canton-sim-server
USER canton
# No writable state: the simulator holds no keys and writes no files.
ENV CANTON_SIM_LISTEN=0.0.0.0:8787
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD curl -fsS http://127.0.0.1:8787/healthz || exit 1
ENTRYPOINT ["canton-sim-server"]
