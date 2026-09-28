import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Keypair, Connection } from "../packages/solana/src/index.js";
import { key } from "./keys.js";
const run = (cmd: string, args: string[]) => {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} failed (${result.status})`);
};
const operator = await key("operator");
const rpc = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
await mkdir("target/deploy", { recursive: true });
const path = "target/deploy/proofcommerce-keypair.json";
if (!existsSync(path)) {
  const kp = Keypair.generate();
  await writeFile(path, JSON.stringify([...kp.secretKey]), {
    flag: "wx",
    mode: 0o600,
  });
}
const program = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(path, "utf8"))),
);
const id = program.publicKey.toBase58();
await writeFile(
  "programs/proofcommerce/src/lib.rs",
  (await readFile("programs/proofcommerce/src/lib.rs", "utf8")).replace(
    /declare_id!\("[^"]+"\)/,
    `declare_id!("${id}")`,
  ),
);
await writeFile(
  "Anchor.toml",
  (await readFile("Anchor.toml", "utf8")).replace(
    /proofcommerce = "[^"]+"/g,
    `proofcommerce = "${id}"`,
  ),
);
run("anchor", ["build"]);
const connection = new Connection(rpc, "confirmed");
if ((await connection.getBalance(operator.publicKey)) < 2000000000) {
  const sig = await connection.requestAirdrop(operator.publicKey, 5000000000);
  await connection.confirmTransaction({
    ...(await connection.getLatestBlockhash()),
    signature: sig,
  });
}
run("solana", [
  "program",
  "deploy",
  "target/deploy/proofcommerce.so",
  "--program-id",
  path,
  "--keypair",
  ".local/keys/operator.json",
  "--url",
  rpc,
]);
if (!(await connection.getAccountInfo(program.publicKey))?.executable)
  throw new Error("Program not executable after deploy");
await writeFile(
  ".env",
  (await readFile(".env", "utf8")).replace(
    /^PROOFCOMMERCE_PROGRAM_ID=.*$/m,
    `PROOFCOMMERCE_PROGRAM_ID=${id}`,
  ),
);
process.stdout.write(`Deployed ${id}. Saved .env; restart API.\n`);
