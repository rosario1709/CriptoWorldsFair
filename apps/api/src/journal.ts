import pg from "pg";
import { config } from "./config.js";
import type { Verification } from "../../../packages/shared/src/index.js";
// Dedicated pool avoids starvation while workflow connections hold row locks.
export const journalPool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});
export async function getDecision(key: string) {
  const result = await journalPool.query<{
    content_hash: string;
    data: Verification;
  }>("SELECT content_hash, data FROM verification_intents WHERE key=$1", [key]);
  return result.rows[0];
}
export async function saveDecision(
  key: string,
  agreementId: string,
  hash: string,
  decision: Verification,
) {
  await journalPool.query(
    "INSERT INTO verification_intents(key,agreement_id,content_hash,data) VALUES($1,$2,$3,$4)",
    [key, agreementId, hash, JSON.stringify(decision)],
  );
}
