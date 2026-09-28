import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const pg = new EmbeddedPostgres({
  databaseDir: ".local/postgres",
  user: "proofcommerce",
  password: "proofcommerce",
  port: 5432,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
});
if (!existsSync(".local/postgres/PG_VERSION")) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("proofcommerce");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("already exists"))
    throw error;
}
process.stdout.write(
  "Portable PostgreSQL is ready on 127.0.0.1:5432. Ctrl+C to stop.\n",
);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
