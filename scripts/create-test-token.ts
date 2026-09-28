import "dotenv/config";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
} from "@solana/spl-token";
import { Connection, PublicKey } from "../packages/solana/src/index.js";
import { key } from "./keys.js";
import { readFile, writeFile } from "node:fs/promises";
import { db, pool } from "../apps/api/src/db.js";
import { agents } from "../apps/api/src/schema.js";
import { eq } from "drizzle-orm";
const connection = new Connection(
    process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899",
    "confirmed",
  ),
  operator = await key("operator");
try {
  for (const name of [
    "operator",
    "buyer",
    "provider",
    "malicious",
    "verifier",
  ]) {
    const k = await key(name);
    if ((await connection.getBalance(k.publicKey)) < 1000000000) {
      const signature = await connection.requestAirdrop(
        k.publicKey,
        2000000000,
      );
      const latest = await connection.getLatestBlockhash();
      const result = await connection.confirmTransaction({
        ...latest,
        signature,
      });
      if (result.value.err) throw new Error("Airdrop failed");
    }
  }
  const mint = process.env.PAYMENT_TOKEN_MINT
    ? new PublicKey(process.env.PAYMENT_TOKEN_MINT)
    : await createMint(connection, operator, operator.publicKey, null, 6);
  if ((await getMint(connection, mint)).decimals !== 6)
    throw new Error("Expected six decimals");
  for (const name of ["buyer", "provider", "malicious", "verifier"]) {
    const wallet = await key(name);
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      operator,
      mint,
      wallet.publicKey,
    );
    if (name === "buyer" && ata.amount < 10000000n)
      await mintTo(
        connection,
        operator,
        mint,
        ata.address,
        operator,
        100000000n,
      );
  }
  let env = await readFile(".env", "utf8");
  env = env.replace(
    /^PAYMENT_TOKEN_MINT=.*$/m,
    `PAYMENT_TOKEN_MINT=${mint.toBase58()}`,
  );
  const verifier = await key("verifier");
  const setting = `VERIFIER_PUBLIC_KEY=${verifier.publicKey.toBase58()}`;
  env = /^VERIFIER_PUBLIC_KEY=.*$/m.test(env)
    ? env.replace(/^VERIFIER_PUBLIC_KEY=.*$/m, setting)
    : `${env}\n${setting}\n`;
  await writeFile(".env", env);
  const [buyer] = await db.select().from(agents).where(eq(agents.id, "buyer"));
  if (buyer)
    await db
      .update(agents)
      .set({
        data: {
          ...buyer.data,
          policy: { ...buyer.data.policy, allowedMints: [mint.toBase58()] },
        },
      })
      .where(eq(agents.id, "buyer"));
  process.stdout.write(
    `pcUSD — Test Stablecoin\nMint: ${mint.toBase58()}\nSaved to .env. Restart API.\n`,
  );
} finally {
  await pool.end();
}
