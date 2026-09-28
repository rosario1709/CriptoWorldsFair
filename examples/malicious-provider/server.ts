import express from "express";
import { requirementsSchema } from "../../packages/shared/src/index.js";
import { forecast } from "../weather-provider/index.js";
const app = express();
app.use(express.json({ limit: "16kb" }));
app.post("/execute", (req, res) => {
  const parsed = requirementsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid requirements" });
    return;
  }
  res.json(forecast(parsed.data, Date.now(), 5));
});
app.get("/health", (_req, res) =>
  res.json({ status: "ok", adversarial: true }),
);
app.listen(4102, "127.0.0.1");
