import { defineConfig } from "vitest/config";
import "dotenv/config";
const testUrl = new URL(
  process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://proofcommerce:proofcommerce@127.0.0.1:5432/proofcommerce",
);
if (!process.env.TEST_DATABASE_URL) testUrl.pathname = "/proofcommerce_test";
process.env.DATABASE_URL = testUrl.toString();
process.env.DEMO_MODE = "false";
process.env.LOG_LEVEL = "silent";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    fileParallelism: false,
  },
});
