import { decodePaymentResponseHeader } from "@x402/core/http";
import { paymentClient } from "../../packages/x402/src/index.js";
import { mint, network, signer, rpcUrl } from "./config.js";
const paidFetch = paymentClient(await signer("buyer"), {
  mint: mint(),
  network: await network(),
  recipient: (await signer("provider")).address,
  rpcUrl,
  maxAmount: 40000n,
});
const response = await paidFetch(
  process.env.X402_RESOURCE_URL ?? "http://127.0.0.1:4021/weather",
);
if (!response.ok) throw new Error(`x402 resource failed: ${response.status}`);
const header = response.headers.get("PAYMENT-RESPONSE");
if (!header) throw new Error("Missing PAYMENT-RESPONSE");
const receipt = decodePaymentResponseHeader(header);
if (!receipt.success || !receipt.transaction)
  throw new Error("Settlement was not confirmed");
process.stdout.write(
  `${JSON.stringify({ receipt, result: await response.json() }, null, 2)}\n`,
);
