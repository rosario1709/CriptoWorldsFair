# Crypto World's Fair 2026 submission draft

**Status:** Draft materials only. Event rules, eligibility and deadlines have not been verified here. No submission has been sent. On-chain demonstration claims must wait for the chain validation gate in VALIDATION.md.

**Product:** ProofCommerce

**Tagline:** Trust & Settlement Infrastructure for Autonomous AI Agents

**One-liner:** ProofCommerce lets autonomous agents discover services, escrow payment, verify delivery, and settle onchain without human intervention.

**Problem:** AI agents can increasingly transact autonomously, but payment alone does not establish whether the counterparty delivered the requested work.

**Solution:** ProofCommerce adds programmable agreements, escrow, cryptographic evidence, deterministic verification and reputation to agent commerce.

**Why blockchain:** The financial state machine provides a shared record and constrains principal movement to agreed recipients. Neither buyer nor provider can unilaterally rewrite those financial terms. Verification remains a designated-authority trust assumption, and the MVP upgrade authority remains privileged.

**Why Solana:** SPL token accounts, programmable escrow and an ecosystem supporting agent payments make it a suitable execution layer. The demo is designed around frequent low-value transactions and reference x402 interoperability. Do not quote unmeasured latency or cost numbers.

**Differentiation:** Payments prove transfer; ProofCommerce binds settlement to an explicit delivery contract and committed evidence. It is verified settlement infrastructure, not an AI wallet. x402 remains a distinct direct-payment integration.

**Demo:** ResearchAgent requests seven forecast days for Lima for 0.04 pcUSD. WeatherAgent delivers seven, deterministic checks approve, escrow pays. MaliciousWeatherAgent delivers five, the count check fails, payment stays protected and the buyer claims a refund.

**Trust model:** Immutable verifier authority per agreement, canonical evidence commitments, explicit spending limits and program-controlled SPL vault. No decentralized verification or arbitration claim.

**Business:** Fee-on-verified-settlement hypothesis and a future managed infrastructure service. No implemented fee and no claimed traction.

**Roadmap:** Independent signers, additional deterministic service contracts, production stablecoins after audit, verifier consensus, MCP/A2A integration and arbitration.

## Links to fill after publication

- Repository: pending
- Public application: pending
- Deployed devnet program: pending actual deployment
- Test mint: pending actual creation
- Pitch video: pending recording
- Technical demo: pending successful financial validation and recording
- Submission page: pending

Use README, the demo runbook and the validation record as supporting material. Never replace a missing real-chain demonstration with generated signatures or unlabeled fixture metrics.
