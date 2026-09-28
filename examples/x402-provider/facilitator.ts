import express from "express";
import { rateLimit } from "express-rate-limit";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactSvmScheme } from "@x402/svm/exact/facilitator";
import { toFacilitatorSvmSigner } from "@x402/svm";
import {
  PaymentPayloadV2Schema,
  PaymentRequirementsV2Schema,
} from "@x402/core/schemas";
import type { PaymentPayload } from "@x402/core/types";
import { z } from "zod";
import { network, signer, rpcUrl, mint } from "./config.js";
const configuredNetwork = await network(),
  asset = mint(),
  recipient = (await signer("provider")).address;
const facilitator = new x402Facilitator().register(
  configuredNetwork,
  new ExactSvmScheme(
    toFacilitatorSvmSigner(await signer("operator"), { defaultRpcUrl: rpcUrl }),
  ),
);
const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(rateLimit({ windowMs: 60000, limit: 30 }));
app.get("/supported", (_req, res) => res.json(facilitator.getSupported()));
for (const method of ["verify", "settle"] as const)
  app.post(`/${method}`, async (req, res) => {
    const parsed = z
      .object({
        paymentPayload: PaymentPayloadV2Schema,
        paymentRequirements: PaymentRequirementsV2Schema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid V2 payment envelope" });
      return;
    }
    const { paymentPayload: p, paymentRequirements: r } = parsed.data;
    if (
      p.x402Version !== 2 ||
      r.network !== configuredNetwork ||
      r.asset !== asset ||
      r.payTo !== recipient ||
      r.amount !== "40000" ||
      r.scheme !== "exact" ||
      r.maxTimeoutSeconds > 120
    ) {
      res.status(400).json({ error: "Payment outside facilitator allowlist" });
      return;
    }
    // The reference Zod schema types network as string; the allowlist above narrows it to CAIP-2.
    res.json(
      await facilitator[method](p as PaymentPayload, {
        ...r,
        network: configuredNetwork,
        extra: r.extra ?? {},
      }),
    );
  });
app.use(
  (
    _error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(502).json({ error: "Facilitator could not confirm payment" }),
);
app.listen(4022, "127.0.0.1", () =>
  process.stdout.write(
    "Reference x402 SVM facilitator on 127.0.0.1:4022. Development use only.\n",
  ),
);
