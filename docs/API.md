# API and SDK reference

Base URL: `http://127.0.0.1:4000` locally. JSON request bodies, 128 KiB limit. All prices are decimal strings, with up to six fractional digits. Errors return `{ "error": { "code": "...", "message": "..." } }`. Domain conflicts are 409, invalid input 400, unauthenticated 401, forbidden 403 and missing resources 404. Infrastructure failures never return fabricated confirmations.

## Authentication

1. `POST /auth/nonce` with `{ "wallet": "<base58 public key>" }`.
2. Sign the exact returned `message` as UTF-8 with Ed25519.
3. `POST /auth/verify` with `{ "wallet", "nonce", "signature": "<base58>" }`.
4. Use `Authorization: Bearer <token>`. Sessions expire after one hour.

`X-Proofcommerce-Demo: true` authorizes local actors only with DEMO_MODE=true. UI shows DEMO MODE. It is not an authentication method for a public deployment.

## Routes

| Method / route                | Meaning / authority                                                         |
| ----------------------------- | --------------------------------------------------------------------------- |
| GET /health                   | DB liveness, actual program readiness, network, demo flag, public mint/ID   |
| GET /services                 | Service catalog                                                             |
| GET /services/:slug           | Service terms                                                               |
| POST /services                | Register weather-verifiable provider service; provider session              |
| GET /agents                   | Agent identities/policies                                                   |
| GET /agents/:id               | Agent profile                                                               |
| POST /agents                  | Development identity or own external wallet; session required               |
| POST /agreements              | Buyer creates terms after price/policy validation                           |
| GET /agreements               | Agreement list, newest first                                                |
| GET /agreements/:id           | Current state, evidence, verification and signatures                        |
| POST /agreements/:id/fund     | Buyer initializes and deposits                                              |
| POST /agreements/:id/accept   | Provider accepts terms                                                      |
| POST /agreements/:id/evidence | Provider submits raw JSON evidence                                          |
| POST /agreements/:id/execute  | Demo-only provider automation                                               |
| POST /agreements/:id/verify   | Verifier runs deterministic engine and records decision                     |
| POST /agreements/:id/settle   | Verifier releases already verified payment                                  |
| POST /agreements/:id/refund   | Buyer claims after rejection or permitted expiry                            |
| POST /agreements/:id/cancel   | Buyer cancels uninitialized or expired Created agreement                    |
| POST /agreements/:id/advisory | Optional Ollama review; authorized participant; never authorizes settlement |
| GET /agreements/:id/events    | Ordered durable event history                                               |
| GET /events/stream            | SSE; optional agreementId and after query parameters                        |
| GET /reputation/:agentId      | Derived job outcomes and settled volume                                     |

All creation/action agreement requests require `Idempotency-Key` of 8–128 characters. Persist keys across retries. Same key and different input returns IDEMPOTENCY_CONFLICT. Keys are scoped by actor, agreement and action. Normal action bodies are `{}`; evidence is the actual JSON payload.

```json
{
  "buyerAgentId": "buyer",
  "service": "weather-7d",
  "requirements": { "city": "Lima", "country": "PE", "days": 7 },
  "maxPrice": "0.05",
  "deadlineSeconds": 3600
}
```

Register a service with providerId, slug, name, description, endpoint and price. The provider endpoint origin must already be operator-allowlisted; only weather verification is executable. Register an agent with name, BUYER/PROVIDER/BOTH, optional publicKey and policy `{maxPerTransaction,dailyBudget,allowedServices,allowedProviders,allowedMints}`. An empty allowlist denies purchases. New identities require funding and a configured signer before purchasing.

## SDK API

`new ProofCommerce({baseUrl, network, demo?, token?, signer?})`

- `login()` uses `SessionSigner.getPublicKey()` and `signMessage(bytes)`.
- `services.list()` / `services.get(slug)`.
- `agreements.create(input, key?)`, `get(id)`, `cancel(id, key?)`.
- `action(id, action, key?)` supports fund/accept/execute/verify/settle/refund/cancel.
- `verify(id, key?)` and `reputation.get(agentId)`.
- `buy({service,requirements,maxPrice,buyerAgentId?,idempotencyKey?,onProgress?})` orchestrates the demo pipeline and returns agreementId/status/verification/transaction/agreement. It stops on rejection; refunds remain explicit.

The packages are workspace source packages, not published npm releases. The SDK accepts a **session signer**, while the Solana adapter accepts an **AgentSigner** with transaction signing. Outside demo mode, provider/verifier actions need their own identities; production cross-party orchestration is not supplied by a buyer's login.

Public reads are intentionally suitable for the public demo dataset only. Pagination, private evidence permissions and tenant isolation are production work.
