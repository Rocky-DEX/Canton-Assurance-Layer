# Fixtures: perp-custody

Command fixtures against the `perp-custody` Daml package used by Rocky's
`canton-bridge` (templates `PlatformAccount`, `DepositIntent`, …). Replace the
contract ids and party ids with values from your participant.

```bash
canton-sim simulate --ledger https://<participant>/ --token-file token.jwt \
  --act-as 'exchange::1220…' fixtures/simulator/perp-custody/platform-account-debit.json
```

| File | What it exercises | Expected simulation |
|---|---|---|
| `platform-account-debit.json` | `PlatformAccount.Debit` | succeeds when `delta <= balance`; otherwise `UNHANDLED_EXCEPTION` with `AssertionFailed "Insufficient balance"` |
| `platform-account-debit-negative.json` | `Debit` with `delta <= 0` | `UNHANDLED_EXCEPTION` with `"Debit delta must be positive"` |
| `deposit-intent-create.json` | `DepositIntent` create by the user party | succeeds; `DAML_AUTHORIZATION_ERROR` if `--act-as` is the exchange instead of `user_handle` |
| `deposit-intent-accept.json` | `DepositIntent.Accept` by the exchange | `CONTRACT_NOT_FOUND` once the intent has been accepted (archived) |
| `request-full.json` | a complete simulation request object (`act_as`, `read_as`, `commands`, …) | as above |
