import "dotenv/config";
import { createSolanaRpc, createKeyPairSignerFromBytes } from "@solana/kit";
import { readFile } from "node:fs/promises";
import { DEVNET } from "../../packages/x402/src/index.js";
export const rpcUrl = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
export async function network(): Promise<`solana:${string}`> {
  if (process.env.SOLANA_NETWORK === "devnet") return DEVNET;
  const genesis = await createSolanaRpc(rpcUrl).getGenesisHash().send();
  return `solana:${genesis.slice(0, 32)}`;
}
export async function signer(name: string) {
  return createKeyPairSignerFromBytes(
    Uint8Array.from(
      JSON.parse(await readFile(`.local/keys/${name}.json`, "utf8")),
    ),
  );
}
export function mint() {
  const value = process.env.PAYMENT_TOKEN_MINT;
  if (!value)
    throw new Error("PAYMENT_TOKEN_MINT is required. Run token:create.");
  return value;
}
