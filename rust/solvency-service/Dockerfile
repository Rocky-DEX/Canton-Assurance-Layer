# The signing service. Built from the repository root so the sibling crates
# resolve:
#
#   docker build -f rust/solvency-service/Dockerfile -t canton-assurance-service .

FROM rust:1.85-slim AS build
WORKDIR /repo
COPY rust rust
RUN cd rust/solvency-service && cargo build --release --locked 2>/dev/null || cargo build --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
  && useradd --system --home /var/lib/canton --create-home canton
COPY --from=build /repo/rust/solvency-service/target/release/canton-solvency-service /usr/local/bin/
USER canton
ENV BIND=0.0.0.0:8790 KEYSTORE_DIR=/var/lib/canton/keystore
VOLUME ["/var/lib/canton/keystore"]
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=3s CMD curl -fsS http://127.0.0.1:8790/health || exit 1
CMD ["canton-solvency-service"]
