import { config } from "./config.js";
import { createApp } from "./app.js";
import { pool } from "./db.js";
import { logger } from "./workflow.js";
import { journalPool } from "./journal.js";
const server = createApp().listen(config.API_PORT, config.API_HOST, () =>
  logger.info(
    { host: config.API_HOST, port: config.API_PORT, demo: config.demo },
    "api.ready",
  ),
);
server.requestTimeout = 120000;
server.headersTimeout = 15000;
const stop = () =>
  server.close(() => {
    void Promise.all([pool.end(), journalPool.end()]).then(() =>
      process.exit(0),
    );
  });
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
