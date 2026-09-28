import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme as ClientScheme } from "@x402/svm/exact/client";
import { ExactSvmScheme as ServerScheme } from "@x402/svm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { ClientSvmSigner } from "@x402/svm";
export const DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const;
export function paymentClient(
  signer: ClientSvmSigner,
  options: {
    mint: string;
    recipient: string;
    rpcUrl: string;
    network: `solana:${string}`;
    maxAmount: bigint;
  },
) {
  const client = new x402Client().register(
    options.network,
    new ClientScheme(signer, { rpcUrl: options.rpcUrl }),
  );
  client.registerPolicy((version, requirements) =>
    version === 2
      ? requirements.filter(
          (r) =>
            r.scheme === "exact" &&
            r.network === options.network &&
            r.asset === options.mint &&
            r.payTo === options.recipient &&
            BigInt(r.amount) > 0n &&
            BigInt(r.amount) <= options.maxAmount &&
            r.maxTimeoutSeconds <= 120,
        )
      : [],
  );
  return wrapFetchWithPayment(fetch, client);
}
export function paymentServer(options: {
  mint: string;
  recipient: string;
  facilitatorUrl: string;
  network: `solana:${string}`;
}) {
  const facilitator = new HTTPFacilitatorClient({
    url: options.facilitatorUrl,
  });
  const server = new x402ResourceServer(facilitator).register(
    options.network,
    new ServerScheme(),
  );
  return paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            network: options.network,
            payTo: options.recipient,
            price: {
              amount: "40000",
              asset: options.mint,
              extra: { decimals: 6 },
            },
            maxTimeoutSeconds: 60,
          },
        ],
        description: "Deterministic weather fixture · pcUSD Test Stablecoin",
        mimeType: "application/json",
      },
    },
    server,
  );
}
