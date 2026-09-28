import type { Requirements } from "../../packages/shared/src/index.js";
export function forecast(
  requirements: Requirements,
  now = Date.now(),
  count = requirements.days,
) {
  return {
    city: requirements.city,
    country: requirements.country,
    days: Array.from({ length: count }, (_, i) => ({
      date: new Date(now + i * 86400000).toISOString().slice(0, 10),
      temperatureC: 19 + (i % 4),
      condition: ["Cloudy", "Clear", "Partly cloudy"][i % 3],
    })),
    generatedAt: new Date(now).toISOString(),
  };
}
