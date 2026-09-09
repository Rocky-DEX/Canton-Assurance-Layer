//! Compiles the vendored Canton Ledger API v2 protos with `protox` (a pure-Rust
//! protobuf compiler), so contributors do not need a system `protoc`.
//!
//! Only message types are generated — canton-sim talks to the participant over
//! the JSON Ledger API and uses these bindings to decode the base64
//! `preparedTransaction` returned by `/v2/interactive-submission/prepare`.

use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let include = PathBuf::from("proto");
    let roots = [
        "com/daml/ledger/api/v2/interactive/interactive_submission_service.proto",
        "com/daml/ledger/api/v2/commands.proto",
        "com/daml/ledger/api/v2/value.proto",
    ];
    for entry in walk(&include) {
        println!("cargo:rerun-if-changed={}", entry.display());
    }
    let fds = protox::compile(roots.iter().map(|r| include.join(r)), [&include])?;
    // prost-types does not ship `google.protobuf.Empty`, so well-known types are
    // compiled locally except for the ones prost-types provides.
    prost_build::Config::new()
        .compile_well_known_types()
        .extern_path(".google.protobuf.Timestamp", "::prost_types::Timestamp")
        .extern_path(".google.protobuf.Duration", "::prost_types::Duration")
        .extern_path(".google.protobuf.Any", "::prost_types::Any")
        .extern_path(".google.protobuf.Struct", "::prost_types::Struct")
        .extern_path(".google.protobuf.Value", "::prost_types::Value")
        .compile_fds(fds)?;
    Ok(())
}

fn walk(dir: &std::path::Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.is_dir() {
            out.extend(walk(&p));
        } else {
            out.push(p);
        }
    }
    out
}
