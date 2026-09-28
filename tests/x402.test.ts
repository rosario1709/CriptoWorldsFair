import { it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { paymentServer, DEVNET } from "../packages/x402/src/index.js";
import { Keypair } from "../packages/solana/src/index.js";
it("reference x402 server issues a V2 challenge for the configured test mint", async () => {
  const mint = Keypair.generate().publicKey.toBase58(),
    recipient = Keypair.generate().publicKey.toBase58(),
    feePayer = Keypair.generate().publicKey.toBase58();
  const capabilities = express();
  capabilities.get("/supported", (_req, res) =>
    res.json({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: DEVNET,
          extra: { feePayer },
        },
      ],
      extensions: [],
      signers: { [DEVNET]: [feePayer] },
    }),
  );
  const listener = capabilities.listen(0, "127.0.0.1");
  await new Promise<void>((r) => listener.once("listening", r));
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No port");
  try {
    const app = express();
    app.use(
      paymentServer({
        mint,
        recipient,
        network: DEVNET,
        facilitatorUrl: `http://127.0.0.1:${address.port}`,
      }),
    );
    app.get("/weather", (_req, res) => res.json({ protected: true }));
    const response = await request(app)
      .get("/weather")
      .set("Accept", "application/json");
    expect(response.status).toBe(402);
    expect(response.headers["x-payment"]).toBeUndefined();
    const challenge = decodePaymentRequiredHeader(
      response.headers["payment-required"],
    );
    expect(challenge.x402Version).toBe(2);
    expect(challenge.accepts[0]).toMatchObject({
      network: DEVNET,
      asset: mint,
      payTo: recipient,
      amount: "40000",
      scheme: "exact",
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      listener.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
