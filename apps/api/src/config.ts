import "dotenv/config";
import { z } from "zod";
const env = z
  .object({
    DATABASE_URL: z
      .string()
      .default(
        "postgresql://proofcommerce:proofcommerce@127.0.0.1:5432/proofcommerce",
      ),
    API_PORT: z.coerce.number().default(4000),
    API_HOST: z.string().default("127.0.0.1"),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    DEMO_MODE: z.enum(["true", "false"]).default("false"),
    SOLANA_RPC_URL: z.string().url().default("http://127.0.0.1:8899"),
    SOLANA_NETWORK: z.enum(["localnet", "devnet"]).default("localnet"),
    PAYMENT_TOKEN_MINT: z.string().default(""),
    PROOFCOMMERCE_PROGRAM_ID: z.string().default(""),
  })
  .parse(process.env);
export const config = { ...env, demo: env.DEMO_MODE === "true" };
if (config.demo && process.env.NODE_ENV === "production")
  throw new Error("DEMO_MODE must not be enabled in production");
