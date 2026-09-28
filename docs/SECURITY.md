# Security and trust model

Unaudited development implementation. Program compilation and real-chain tests remain pending in the originating Windows environment. Do not custody production assets.

| Threat                                    | Enforcement                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Double settlement; settlement/refund race | Program terminal states plus DB row locks                                             |
| Wrong buyer/provider/verifier             | Signer + immutable `has_one` constraints                                              |
| Wrong mint/account owner                  | Typed Anchor token accounts, ATA constraints, standard SPL program                    |
| Wrong destination                         | Provider ATA for payment; buyer ATA for refund                                        |
| Changed terms/amount                      | Immutable fields and requirements commitment                                          |
| Self-purchase                             | Buyer/provider/verifier must be distinct                                              |
| Replay                                    | Unique PDA and checked state transitions                                              |
| Accepted-work withdrawal                  | Only verifier rejection or unverified expiry permits refund                           |
| Evidence substitution                     | Canonical hash plus approval bound to committed hash                                  |
| Overflow                                  | u64 principal, checked deadline arithmetic, release overflow checks, bigint off-chain |

A SQL update cannot change token balances. Development API processes do possess disposable signing keys and a compromised process can act as those demo actors. Production signers must independently enforce program, account, amount, deadline and spending policies. The upgrade authority is another trust assumption; production needs audited governance or explicitly immutable deployment.

## Authentication and backend

Wallet login signs origin, wallet and a 256-bit nonce. Nonces expire in five minutes and are consumed under a row lock. Ed25519 signatures authorize one-hour sessions whose hashes are stored in PostgreSQL. Each mutation validates the relevant identity. Browser tokens use session storage; deploy under TLS and a strict CSP.

DEMO_MODE enables automated identities only when explicitly configured and is forbidden under NODE_ENV=production. Bind demo services to loopback. The demo header is not production authentication. Read APIs/SSE are public for non-sensitive demo evidence; production needs tenant authorization, stream quotas and access control.

Zod, Helmet, CORS, request limits, rate limits and timeouts protect the API boundary. Providers never supply executable code. Remote calls require an operator allowlist, disallow redirects, cap streaming bytes and time out after ten seconds. Production additionally needs outbound network controls against DNS rebinding.

## Recovery

DB commits and chain confirmation are not atomic. Retries inspect real state and recover matching recent transaction signatures. A timeout is not proof that no payment happened; preserve idempotency keys and exact evidence. Pruned history causes an explicit reconciliation error. Do not create replacement purchases automatically after ambiguous timeouts.

Verifier decisions are durably journaled before chain approval to retain the original freshness evaluation across crashes. The independent journal pool avoids starvation while row locks are held. Production still requires signed transaction intents, long-range indexing, reconciliation operators and alerting.

Logs contain event/correlation IDs and signatures, not keys/tokens. Key files and DB data are ignored by Git. File mode 0600 is requested where supported; restrict Windows ACLs too. Hosted signers belong in a secret manager or isolated signing service.

## Verification boundaries

Schema, city/country, day count, freshness, consecutive dates and commitment are checked. Forecast truth is not checked. The optional LLM receives no gateway/signer; its advice never feeds automatic approval.

x402 uses reference SVM transaction verification. Client/server bind network, asset, recipient and amount. The local facilitator's reference in-process replay/settlement cache is not a production multi-worker architecture: durable shared settlement caching and request-level fulfillment identities are required before scaling or restart-safe paid fulfillment. x402 itself does not escrow for delivery verification.

## Evidence of security

API tests inject a test-only ledger for SQL/auth behavior. `tests/chain.ts` sends actual invalid instructions and checks token balances. Only execution of the latter establishes behavior of the compiled escrow. See [VALIDATION.md](VALIDATION.md).
