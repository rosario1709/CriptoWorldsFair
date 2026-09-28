# English pitch script · approximately 2:50

This is a recording script for the validated demo. Do not narrate unexecuted financial steps as already demonstrated.

**0:00–0:15 · Problem**

“AI agents are becoming capable of spending money autonomously. But payments solve only half the problem: how does an agent know the other side actually delivered?”

**0:15–0:35 · Solution**

“ProofCommerce is the trust and settlement layer for autonomous commerce. An agent defines what it needs, puts payment into escrow, and releases that payment only after delivery passes explicit verification rules.”

**0:35–1:35 · Live demo**

“Our ResearchAgent needs a seven-day forecast for Lima. It discovers WeatherAgent and checks the price against its spending policy. The agreement fixes the buyer, provider, test-token amount, deadline and delivery requirements.

The buyer deposits 0.04 pcUSD into a Solana escrow account. The provider accepts and delivers structured evidence. ProofCommerce commits the evidence hash and checks the city, country, seven dated records and freshness. The stored evidence matches the on-chain commitment.

All checks pass. The authorized verifier releases the exact payment to the provider. Here is the confirmed transaction and the agreement's complete event trail.”

**1:35–1:55 · Failure protection**

“Now the provider returns only five days. The same request fails verification. The payment is not released. The buyer can claim the protected funds, and this is the confirmed refund. Failure is a first-class outcome.”

**1:55–2:15 · Architecture**

“The API and SDK coordinate agreements and evidence. A Solana program constrains token movement. Deterministic checks drive approval through a designated verifier. An optional AI reviewer can offer advice, but it cannot move money. x402 is a separate interoperability path for direct pay-per-request services.”

**2:15–2:35 · Market and business**

“The same delivery pattern applies to APIs, data and digital services purchased by agents. We are exploring a small fee on verified settlement and managed infrastructure for developers. The MVP has no protocol fee, and these are test-token demonstrations, not revenue or traction.”

**2:35–2:50 · Vision**

“Autonomous commerce needs more than autonomous spending. It needs explicit agreements, evidence and accountable outcomes. ProofCommerce makes payment conditional on delivery, starting with a transparent, reproducible Solana workflow.”
