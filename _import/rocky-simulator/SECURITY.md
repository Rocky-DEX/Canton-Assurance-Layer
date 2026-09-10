# Security Policy

## Threat model

canton-sim is read-only by design: it calls `prepare`, `events-by-contract-id`, `version`
and public Scan endpoints, never `execute` or `submit`, and never signs or stores keys.
The main assets it handles are bearer tokens (in memory, per request, never logged) and
simulation reports, which contain contract arguments.

Deploy `canton-sim-server` behind the same access control as the participant's JSON
Ledger API. With `--forward-auth` (default) the service forwards a caller's bearer token
to the participant unchanged; disable it and use a read-only server token when the service
is exposed to callers who should not reach the participant directly.

## Supported versions

Only the `main` branch and the latest tagged release receive security fixes.

## Reporting a vulnerability

Please do not open a public issue. Report privately to the Rocky DEX team via
[Discord](https://discord.gg/Wu5VmFfjSn) (direct message to a maintainer) or to the
contact listed in the repository's GitHub security settings. Include a description,
reproduction steps and the affected version. We aim to acknowledge reports within
3 business days and to publish a fix or mitigation within 30 days for confirmed issues.
