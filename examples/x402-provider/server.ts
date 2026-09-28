import express from "express";
import helmet from "helmet";
import { paymentServer } from "../../packages/x402/src/index.js";
import { mint, network, signer } from "./config.js";
import { forecast } from "../weather-provider/index.js";
const app = express();
app.use(helmet());
app.use(
  paymentServer({
    mint: mint(),
    network: await network(),
    recipient: (await signer("provider")).address,
    facilitatorUrl: process.env.X402_FACILITATOR_URL ?? "http://127.0.0.1:4022",
  }),
);
app.get("/weather", (_req, res) =>
  res.json(forecast({ city: "Lima", country: "PE", days: 7 })),
);
app.listen(4021, "127.0.0.1", () =>
  process.stdout.write(
    "x402 V2 resource server on port 4021. Instant pay-per-request, separate from verified escrow.\n",
  ),
);
