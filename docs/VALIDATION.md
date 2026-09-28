# Validation record

Environment: Windows x64, Node 24.21.0, pnpm 10.32.1, portable PostgreSQL 18.4, Chromium via Playwright. The initial directory was empty. No Docker, Rust, Anchor, Solana CLI or WSL installation was present.

## Executed

| Check                                         | Result                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| pnpm install                                  | Passed; lockfile generated                                                    |
| PostgreSQL portable start / migrations / seed | Passed against real PostgreSQL                                                |
| pnpm lint                                     | Passed                                                                        |
| pnpm typecheck                                | Passed, strict TypeScript                                                     |
| pnpm test                                     | 33 passed: 22 domain, 10 PostgreSQL API, 1 x402 V2 handshake                  |
| pnpm build                                    | Passed: API bundle and Next.js production build                               |
| pnpm test:e2e                                 | 4 passed, 2 explicitly skipped pending chain setup                            |
| pnpm chain:build                              | Blocked: anchor command not installed                                         |
| pnpm test:chain                               | Failed precondition: deployed program and mint absent; does not silently skip |

Browser checks cover marketplace/filter/hire form, actual dashboard data, responsive mobile layout and truthful unavailable-chain errors. Screenshots are generated under `.local/screenshots/`. The two skipped cases are real payment and refund UI flows, not mock successes.

API tests use PostgreSQL row locks and real Ed25519 authentication in an isolated `proofcommerce_test` database. `pnpm test` creates/migrates this local database; for a remote server, supply a dedicated TEST_DATABASE_URL ending in `_test`. An injected ledger double is limited to the test file, never a runtime mode. Its explicit TEST_ONLY markers are cleaned afterward. These tests do not prove the compiled Anchor program works.

## Not established

Both `pnpm demo:success` and `pnpm demo:failure` were also executed. Both correctly exited with CHAIN_UNAVAILABLE because no mint/program exists in this environment. Neither financial demo completed.

- Anchor compilation and Rust test execution.
- Program deployment, test mint creation and actual SPL escrow movement.
- Real-chain attack suite, CLI success/refund demos and their UI equivalents.
- Full x402 paid settlement, as distinct from the validated V2 402 challenge.
- Docker image build or remote CI execution (Docker/remote runner unavailable).
- Hosted deployment or Colosseum submission.

The project is therefore an implemented application and contract source with validated off-chain behavior, **not yet a fully validated on-chain MVP**. The final completion conditions in the project brief have not all been met.

To close the gap, run the real-chain job in `.github/workflows/blockchain.yml` or use a Linux/macOS/WSL environment following README. Record actual public program/mint IDs and transaction receipts. Never mark blocked checks green based on source inspection or test doubles.
