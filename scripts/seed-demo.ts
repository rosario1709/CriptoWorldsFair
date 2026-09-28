import { db, pool } from "../apps/api/src/db.js";
import { agents, services } from "../apps/api/src/schema.js";
import { key } from "./keys.js";
import { config } from "../apps/api/src/config.js";
import type { Agent, Service } from "../packages/shared/src/index.js";
export async function seed() {
  const now = new Date().toISOString();
  for (const [id, name, type] of [
    ["buyer", "ResearchAgent", "BUYER"],
    ["provider", "WeatherAgent", "PROVIDER"],
    ["malicious", "MaliciousWeatherAgent", "PROVIDER"],
    ["translation", "TranslationAgent", "PROVIDER"],
    ["image", "ImageAnalysisAgent", "PROVIDER"],
  ] as const) {
    const k = await key(id);
    const data: Agent = {
      id,
      name,
      type,
      publicKey: k.publicKey.toBase58(),
      demo: true,
      createdAt: now,
      policy: {
        maxPerTransaction: "1.00",
        dailyBudget: "10.00",
        allowedServices: ["weather"],
        allowedProviders: ["provider", "malicious"],
        allowedMints: config.PAYMENT_TOKEN_MINT
          ? [config.PAYMENT_TOKEN_MINT]
          : [],
      },
    };
    await db
      .insert(agents)
      .values({ id, publicKey: data.publicKey, data })
      .onConflictDoNothing();
  }
  for (const [id, name, providerId, category, endpoint, active] of [
    [
      "weather-7d",
      "7-Day Weather Forecast",
      "provider",
      "weather",
      "http://127.0.0.1:4101/execute",
      true,
    ],
    [
      "weather-7d-malicious",
      "Adversarial Weather Test",
      "malicious",
      "weather",
      "http://127.0.0.1:4102/execute",
      true,
    ],
    [
      "translation",
      "Contextual Translation",
      "translation",
      "translation",
      "",
      false,
    ],
    ["image-analysis", "Image Analysis", "image", "vision", "", false],
  ] as const) {
    const data: Service = {
      id,
      slug: id,
      name,
      providerId,
      category,
      endpoint,
      active,
      price: "0.04",
      currency: "pcUSD",
      verificationType: "JSON_SCHEMA",
      demo: true,
      createdAt: now,
      description:
        category === "weather"
          ? "A deterministic local weather fixture. Demonstrates delivery verification, not meteorological accuracy."
          : "Planned service. Not executable in the weather MVP.",
    };
    await db
      .insert(services)
      .values({ id, slug: id, providerId, data })
      .onConflictDoNothing();
  }
}
try {
  await seed();
  process.stdout.write(
    "Demo agents and services seeded. No fabricated jobs or volume.\n",
  );
} finally {
  await pool.end();
}
