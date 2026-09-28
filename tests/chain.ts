/** Executes against a deployed program and real SPL token accounts. No ledger mocks. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  createMint,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import {
  SolanaEscrow,
  DevelopmentSigner,
  PublicKey,
  type ChainAction,
} from "../packages/solana/src/index.js";
import type { Agreement } from "../packages/shared/src/index.js";
import { hash } from "../packages/verifier/src/index.js";
import { key } from "../scripts/keys.js";
const program = process.env.PROOFCOMMERCE_PROGRAM_ID,
  mint = process.env.PAYMENT_TOKEN_MINT;
if (!program || !mint)
  throw new Error(
    "Real chain tests require chain:deploy and token:create. Tests are NOT skipped.",
  );
const buyer = await key("buyer"),
  provider = await key("provider"),
  verifier = await key("verifier"),
  operator = await key("operator");
const chain = new SolanaEscrow(
  process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899",
  program,
  {
    buyer: new DevelopmentSigner(buyer),
    provider: new DevelopmentSigner(provider),
    verifier: new DevelopmentSigner(verifier),
  },
);
assert(await chain.health(), "Escrow program must be deployed");
const requirements = { city: "Lima", country: "PE", days: 7 };
function agreement(seconds = 3600): Agreement {
  return {
    id: randomUUID(),
    correlationId: randomUUID(),
    buyerAgentId: "buyer",
    providerAgentId: "provider",
    serviceId: "weather-7d",
    amount: "0.04",
    mint: mint!,
    buyerWallet: buyer.publicKey.toBase58(),
    providerWallet: provider.publicKey.toBase58(),
    requirements,
    requirementsHash: hash(requirements),
    status: "CREATED",
    deadline: Math.floor(Date.now() / 1000) + seconds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    transactions: {},
    demo: true,
    evidence: {
      payload: { fixture: true },
      contentHash: hash({ fixture: true }),
      submittedAt: new Date().toISOString(),
    },
  };
}
async function raw(
  action: ChainAction,
  a: Agreement,
  change?: (ix: TransactionInstruction) => void,
  signer = action === "accept" || action === "submit"
    ? provider
    : action === "approve" || action === "settle"
      ? verifier
      : buyer,
  approved = true,
) {
  const { instruction } = chain.instruction(action, a, approved);
  change?.(instruction);
  return sendAndConfirmTransaction(
    chain.connection,
    new Transaction().add(instruction),
    [signer],
    { commitment: "confirmed" },
  );
}
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  process.stdout.write(`PASS ${name}\n`);
}
const a = agreement();
await test("successful initialization and exact escrow funding", async () => {
  await raw("initialize", a);
  await raw("fund", a);
  const vault = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(chain.address(a)),
    true,
  );
  assert.equal((await getAccount(chain.connection, vault)).amount, 40000n);
});
await test("wrong buyer rejected on-chain", async () => {
  const other = agreement();
  await raw("initialize", other);
  await assert.rejects(() =>
    raw(
      "fund",
      other,
      (ix) => {
        ix.keys[0].pubkey = provider.publicKey;
      },
      provider,
    ),
  );
});
await test("wrong provider rejected on-chain", async () => {
  await assert.rejects(() =>
    raw(
      "accept",
      a,
      (ix) => {
        ix.keys[0].pubkey = buyer.publicKey;
      },
      buyer,
    ),
  );
});
await test("wrong mint rejected on-chain", async () => {
  const bad = await createMint(
    chain.connection,
    operator,
    operator.publicKey,
    null,
    6,
  );
  const other = agreement();
  await raw("initialize", other);
  await assert.rejects(() =>
    raw("fund", other, (ix) => {
      ix.keys[2].pubkey = bad;
    }),
  );
});
await test("zero amount rejected on-chain", async () => {
  const other = agreement();
  other.amount = "0";
  await assert.rejects(() => raw("initialize", other));
});
await test("amount cannot be changed after initialization", async () => {
  const altered = { ...a, amount: "0.05" };
  await assert.rejects(() => chain.state(altered), /differs from on-chain/);
  assert.equal((await chain.state(a))?.amount, 40000n);
});
await test("mint decimals are enforced", async () => {
  const wrong = await createMint(
    chain.connection,
    operator,
    operator.publicKey,
    null,
    9,
  );
  const other = agreement();
  other.mint = wrong.toBase58();
  await assert.rejects(() => raw("initialize", other));
});
await test("provider cannot fund their own agreement", async () => {
  const other = agreement();
  other.providerWallet = other.buyerWallet;
  await assert.rejects(() => raw("initialize", other));
});
await test("bad transition cannot settle funded work", async () => {
  await assert.rejects(() => raw("settle", a));
});
await raw("accept", a);
await test("buyer cannot withdraw accepted work before deadline", async () => {
  await assert.rejects(() => raw("refund", a));
});
await raw("submit", a);
await test("wrong evidence hash cannot be approved", async () => {
  const altered = structuredClone(a);
  altered.evidence!.contentHash = "f".repeat(64);
  await assert.rejects(() => raw("approve", altered));
});
await test("unauthorized verifier rejected", async () => {
  await assert.rejects(() =>
    raw(
      "approve",
      a,
      (ix) => {
        ix.keys[0].pubkey = provider.publicKey;
      },
      provider,
    ),
  );
});
await raw("approve", a);
await test("wrong destination rejected", async () => {
  const buyerAta = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    buyer.publicKey,
  );
  await assert.rejects(() =>
    raw("settle", a, (ix) => {
      ix.keys[4].pubkey = buyerAta;
    }),
  );
});
await test("unauthorized settlement rejected", async () => {
  await assert.rejects(() =>
    raw(
      "settle",
      a,
      (ix) => {
        ix.keys[0].pubkey = buyer.publicKey;
      },
      buyer,
    ),
  );
});
await test("verified payment transfers exact amount to provider", async () => {
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    provider.publicKey,
  );
  const before = (await getAccount(chain.connection, ata)).amount;
  await raw("settle", a);
  assert.equal(
    (await getAccount(chain.connection, ata)).amount - before,
    40000n,
  );
  assert.equal((await chain.state(a))?.state, "SETTLED");
});
await test("double settlement rejected", async () => {
  await assert.rejects(() => raw("settle", a));
});
await test("refund after settlement rejected", async () => {
  await assert.rejects(() => raw("refund", a));
});
await test("rejected delivery refunds and cannot settle afterward", async () => {
  const b = agreement();
  await raw("initialize", b);
  await raw("fund", b);
  await raw("accept", b);
  await raw("submit", b);
  await raw("approve", b, undefined, verifier, false);
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    buyer.publicKey,
  );
  const before = (await getAccount(chain.connection, ata)).amount;
  await raw("refund", b);
  assert.equal(
    (await getAccount(chain.connection, ata)).amount - before,
    40000n,
  );
  await assert.rejects(() => raw("settle", b));
  await assert.rejects(() => raw("refund", b));
});
await test("expired agreement cannot initialize", async () => {
  await assert.rejects(() => raw("initialize", agreement(-1)));
});
await test("expired accepted agreement refunds", async () => {
  const b = agreement(12);
  await raw("initialize", b);
  await raw("fund", b);
  await raw("accept", b);
  while (Math.floor(Date.now() / 1000) <= b.deadline + 1)
    await new Promise((r) => setTimeout(r, 1000));
  await raw("refund", b);
  assert.equal((await chain.state(b))?.state, "REFUNDED");
});
await test("account substitution cannot drain another vault", async () => {
  const b = agreement();
  await raw("initialize", b);
  await raw("fund", b);
  await raw("accept", b);
  await raw("submit", b);
  await raw("approve", b);
  const unrelated = await getOrCreateAssociatedTokenAccount(
    chain.connection,
    operator,
    new PublicKey(mint),
    verifier.publicKey,
  );
  await assert.rejects(() =>
    raw("settle", b, (ix) => {
      ix.keys[3].pubkey = unrelated.address;
    }),
  );
});
process.stdout.write(`${passed} real on-chain tests passed.\n`);
