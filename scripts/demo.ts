import "dotenv/config";
import { ProofCommerce } from "../packages/sdk/src/index.js";
const failure = process.argv[2] === "failure";
const client = new ProofCommerce({
  baseUrl: process.env.API_URL ?? "http://127.0.0.1:4000",
  network: process.env.SOLANA_NETWORK === "devnet" ? "devnet" : "localnet",
  demo: true,
});
process.stdout.write(
  "=== PROOFCOMMERCE ===\nBuyer: ResearchAgent\nRequest: 7-day weather forecast for Lima\nSearching marketplace...\n",
);
try {
  const service = await client.services.get(
    failure ? "weather-7d-malicious" : "weather-7d",
  );
  process.stdout.write(
    `Provider: ${service.providerId}\nPrice: ${service.price} pcUSD — Test Stablecoin\n`,
  );
  const result = await client.buy({
    service: service.slug,
    requirements: { city: "Lima", country: "PE", days: 7 },
    maxPrice: "0.05",
    onProgress: (a) =>
      process.stdout.write(
        `${a.status}${a.transactions.settle ? ` ${a.transactions.settle}` : ""}\n`,
      ),
  });
  for (const check of result.verification?.checks ?? [])
    process.stdout.write(
      `${check.status} ${check.name}: expected ${JSON.stringify(check.expected)}, received ${JSON.stringify(check.actual)}\n`,
    );
  if (failure) {
    if (result.status !== "REJECTED")
      throw new Error("Failure demo did not reject evidence");
    process.stdout.write("Settlement BLOCKED. Funds PROTECTED.\n");
    const refunded = await client.action(result.agreementId, "refund");
    if (refunded.status !== "REFUNDED" || !refunded.transactions.refund)
      throw new Error("Refund not confirmed");
    process.stdout.write(
      `Refund COMPLETED\nTransaction: ${refunded.transactions.refund}\n`,
    );
  } else if (result.status !== "SETTLED" || !result.transaction)
    throw new Error("No confirmed settlement");
  else
    process.stdout.write(
      `Payment released: 0.040000 pcUSD\nTransaction: ${result.transaction}\n`,
    );
  process.stdout.write(`Agreement: /agreements/${result.agreementId}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : error}\nDemo not completed. No payment success has been fabricated.\n`,
  );
  process.exitCode = 1;
}
