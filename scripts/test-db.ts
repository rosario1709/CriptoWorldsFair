import "dotenv/config";
import pg from "pg";
const url = new URL(
  process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://proofcommerce:proofcommerce@127.0.0.1:5432/proofcommerce",
);
if (!process.env.TEST_DATABASE_URL) {
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname))
    throw new Error(
      "Set a dedicated TEST_DATABASE_URL for a remote test database.",
    );
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname='proofcommerce_test'",
    );
    if (!exists.rowCount)
      await admin.query("CREATE DATABASE proofcommerce_test");
  } finally {
    await admin.end();
  }
  url.pathname = "/proofcommerce_test";
}
if (!url.pathname.endsWith("_test"))
  throw new Error(
    "Test database name must end in _test to avoid application data.",
  );
process.env.DATABASE_URL = url.toString();
await import("./migrate.js");
