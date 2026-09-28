# Reproducible demo runbook

## Gate before recording

Do not record a claimed successful financial demo until all these pass:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm chain:deploy
pnpm token:create
pnpm test:chain
```

Database and validator must already be running (see README). Restart `pnpm dev` after deployment/token scripts update `.env`. GET /health must report `database: true` and `chainReady: true`. Original Windows workspace has not passed the chain gate.

## Successful delivery

1. Open `/marketplace` and the 7-Day Weather Forecast service.
2. Show price 0.04 pcUSD, city Lima, country PE, seven days and deterministic rules.
3. Click Hire Agent. The policy engine reserves the budget and creates a real database agreement.
4. On its agreement page, click Fund escrow & continue. Watch SSE update funding, acceptance, commitment, verification and settlement.
5. Expand View Evidence; show seven dated records and SHA-256 commitment.
6. Show the check report and confirmed payment signature. On devnet open the Explorer link; on localnet describe it as a local validator transaction.
7. Show derived provider reputation and dashboard settled volume.

CLI equivalent: `pnpm demo:success` (or `pnpm demo:buyer`). Keep the generated agreement URL and transaction signature for the recording. Do not prefill fake success entries if the command fails.

## Failed delivery and refund

1. Select Adversarial Weather Test, requesting the same seven days.
2. Hire and run the workflow. MaliciousWeatherAgent returns five days.
3. Show PASS city/country, FAIL days with expected 7 / actual 5.
4. Show Delivery rejected, Payment protected, and no settlement signature.
5. Click Refund protected funds. Wait for confirmed refund and display its signature.
6. Explain that retry is possible before the deadline; the malicious fixture will still return five unless the request actually asked for five.

CLI equivalent: `pnpm demo:failure`, which includes the refund automatically. A FAIL result alone does not mean funds have been refunded; that is a separate confirmed transaction.

## Independent providers and x402

`pnpm provider:weather` exposes POST `http://127.0.0.1:4101/execute`; malicious provider uses 4102. Post `{city:"Lima",country:"PE",days:7}` as valid JSON. The integrated demo uses the same function directly to avoid requiring extra processes.

For x402 start `pnpm x402:facilitator`, then `pnpm x402:server`, then `pnpm demo:x402`. Show the initial 402, PAYMENT-REQUIRED header and confirmed PAYMENT-RESPONSE. Explain that this is direct pay-per-request, not the verified escrow flow.

## Capture checklist

- 1440×900 desktop viewport; browser zoom 100%; hide developer tool overlays.
- A 390px mobile screenshot of marketplace.
- Landing hero, marketplace, requirements, funded agreement, PASS report, evidence, settlement signature.
- Rejected delivery, expected/actual count, protected state and confirmed refund.
- Devnet Explorer only for real devnet transactions.
- Terminal buyer output plus actual public program/mint IDs.
- Keep DEMO MODE and pcUSD — Test Stablecoin visible.
- No secret files, terminal key contents, session tokens or credentials in recordings.

`pnpm test:e2e` saves non-financial screenshots in `.local/screenshots`. `E2E_CHAIN=true pnpm test:e2e` additionally captures the real success/failure screens after chain setup. The default skipped chain tests are not proof of a completed demo.
