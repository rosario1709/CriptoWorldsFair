# Technical video · maximum 3 minutes

**Before recording:** complete docs/DEMO.md gates. Prefer devnet for the Explorer segment. Show the real terminal, browser and transaction, without editing in a simulated successful state.

| Time      | Screen and action             | Narration                                                            |
| --------- | ----------------------------- | -------------------------------------------------------------------- |
| 0:00–0:15 | Buyer CLI and marketplace     | ResearchAgent requests seven forecast days; show price and policy    |
| 0:15–0:30 | Service / Hire Agent          | Terms bind city, country, days and price                             |
| 0:30–0:50 | Agreement timeline / fund     | Confirm real SPL escrow deposit and PDA                              |
| 0:50–1:10 | Provider execution / evidence | Show JSON and canonical SHA-256 commitment                           |
| 1:10–1:30 | Verification checks           | City, country, exact count, freshness, date sequence, committed hash |
| 1:30–1:45 | Payment released / Explorer   | Open real devnet signature; show recipient and amount                |
| 1:45–2:10 | MaliciousWeatherAgent         | Same seven-day request returns five; FAIL count                      |
| 2:10–2:30 | Protected payment / refund    | No settlement signature; claim and show confirmed refund             |
| 2:30–2:45 | Tests and architecture        | Distinguish real-chain tests from SQL orchestration tests            |
| 2:45–2:55 | SDK and x402 module           | Show small integration surface; x402 direct payments are separate    |

Leave five seconds of margin. If using localnet, replace Explorer with actual validator transaction inspection and explicitly call it localnet; do not use a devnet URL for a local transaction. Keep test token/demo labels visible. Capture checklist is in DEMO.md.
