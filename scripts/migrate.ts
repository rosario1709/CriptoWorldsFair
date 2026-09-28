import { readFile, readdir } from "node:fs/promises";
import { pool } from "../apps/api/src/db.js";
try {
  for (const file of (await readdir("apps/api/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await pool.query(await readFile(`apps/api/migrations/${file}`, "utf8"));
  }
  process.stdout.write("Database migrations applied.\n");
} finally {
  await pool.end();
}
