import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), "../../.env"), quiet: true });
const api = process.env.NEXT_PUBLIC_API_URL;
if (process.env.NODE_ENV === "production" && !api)
  throw new Error(
    "Set NEXT_PUBLIC_API_URL before building the web application.",
  );
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  env: { NEXT_PUBLIC_API_URL: api ?? "http://localhost:4000" },
};
export default config;
