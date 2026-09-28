import "dotenv/config";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { Keypair } from "../packages/solana/src/index.js";
export async function key(name: string) {
  const path = `.local/keys/${name}.json`;
  await mkdir(".local/keys", { recursive: true });
  try {
    const bytes: number[] = JSON.parse(await readFile(path, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const k = Keypair.generate();
    await writeFile(path, JSON.stringify([...k.secretKey]), {
      flag: "wx",
      mode: 0o600,
    });
    return k;
  }
}
if (process.argv[1]?.endsWith("keys.ts"))
  for (const name of [
    "buyer",
    "provider",
    "verifier",
    "operator",
    "malicious",
    "translation",
    "image",
  ]) {
    const k = await key(name);
    process.stdout.write(`${name}: ${k.publicKey.toBase58()}\n`);
  }
