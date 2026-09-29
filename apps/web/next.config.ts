import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const api = process.env.NEXT_PUBLIC_API_URL;
const upstream = process.env.API_UPSTREAM_URL;

if (process.env.NODE_ENV === "production") {
  if (!api) {
    throw new Error(
      "Set NEXT_PUBLIC_API_URL before building the web application.",
    );
  }

  if (api === "/api" && !upstream) {
    throw new Error(
      "Set API_UPSTREAM_URL when NEXT_PUBLIC_API_URL is /api.",
    );
  }
}

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,

  env: {
    NEXT_PUBLIC_API_URL: api ?? "http://localhost:4000",
  },

  async rewrites() {
    if (!upstream) return [];

    const target = upstream.replace(/\/$/, "");

    return [
      {
        source: "/api/:path*",
        destination: `${target}/:path*`,
      },
    ];
  },
};

export default config;
