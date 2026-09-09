FROM rust:1.88-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --release -p canton-sim -p canton-sim-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/canton-sim /usr/local/bin/canton-sim
COPY --from=build /src/target/release/canton-sim-server /usr/local/bin/canton-sim-server
EXPOSE 8787
ENV CANTON_SIM_LISTEN=0.0.0.0:8787
ENTRYPOINT ["canton-sim-server"]
