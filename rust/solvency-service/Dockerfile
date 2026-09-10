# The signing service. Built from the repository root so the sibling crates
# resolve:
#
#   docker build -f rust/solvency-service/Dockerfile -t canton-assurance-service .

FROM rust:1.88-slim AS build
WORKDIR /repo
COPY rust rust
# rust/ is one workspace; the lockfile and target directory sit at its root.
RUN cargo build --release --locked --manifest-path rust/Cargo.toml -p canton-solvency-service

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
  && useradd --system --home /var/lib/canton --create-home canton \
  && mkdir -p /var/lib/canton/keystore && chown canton:canton /var/lib/canton/keystore && chmod 700 /var/lib/canton/keystore
# The mount point is created owned by the service user so a fresh named
# volume inherits that ownership. Without it Docker creates the volume
# root-owned and the service, running as `canton`, cannot write a single key
# file; the service now refuses to start in that state.
COPY --from=build /repo/rust/target/release/canton-solvency-service /usr/local/bin/
USER canton
ENV BIND=0.0.0.0:8790 KEYSTORE_DIR=/var/lib/canton/keystore
VOLUME ["/var/lib/canton/keystore"]
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=3s CMD curl -fsS http://127.0.0.1:8790/health || exit 1
CMD ["canton-solvency-service"]
