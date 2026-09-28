import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eq, gt, asc, desc, and } from "drizzle-orm";
import { config } from "./config.js";
import { db, pool } from "./db.js";
import * as s from "./schema.js";
import { actor, auth, publicKey } from "./auth.js";
import { Workflow, logger, type GatewayFactory } from "./workflow.js";
import { gateway } from "./gateway.js";
import {
  DomainError,
  requirementsSchema,
  amountSchema,
  policySchema,
  reputation,
  type Agent,
} from "../../../packages/shared/src/index.js";
import { Keypair } from "../../../packages/solana/src/index.js";
import { mkdir, writeFile } from "node:fs/promises";
import { forecast } from "../../../examples/weather-provider/index.js";
import pg from "pg";
import { executeProvider } from "./provider.js";
import { configuredLLMVerifier } from "../../../packages/verifier/src/llm.js";
const idempotency = (req: express.Request) =>
  z.string().min(8).max(128).parse(req.headers["idempotency-key"]);
const createSchema = z
  .object({
    buyerAgentId: z.string().min(1),
    service: z.string().min(1),
    requirements: requirementsSchema,
    maxPrice: amountSchema,
    deadlineSeconds: z.number().int().min(15).max(604800).default(3600),
  })
  .strict();

export function createApp(
  factory: GatewayFactory = gateway,
  mint = config.PAYMENT_TOKEN_MINT,
) {
  const app = express(),
    workflow = new Workflow(factory, mint);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
    }),
  );
  app.use(express.json({ limit: "128kb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMIT",
          message: "Too many requests; retry after the rate-limit window",
        },
      },
    }),
  );
  app.use((req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== config.CORS_ORIGIN
    )
      throw new DomainError("ORIGIN", "Untrusted request origin", 403);
    next();
  });
  app.get("/health", async (_req, res) => {
    await pool.query("select 1");
    let chain = false;
    try {
      chain = await (await gateway()).health();
    } catch {
      /* Readiness is false, never simulated. */
    }
    res.json({
      status: "ok",
      database: true,
      chainReady: chain,
      network: config.SOLANA_NETWORK,
      demo: config.demo,
      mint: config.PAYMENT_TOKEN_MINT || null,
      programId: config.PROOFCOMMERCE_PROGRAM_ID || null,
    });
  });
  app.use("/auth", rateLimit({ windowMs: 60000, limit: 20 }), auth);
  app.post("/agreements/:id/advisory", async (req, res) => {
    const who = await actor(req);
    const [row] = await db
      .select()
      .from(s.agreements)
      .where(eq(s.agreements.id, String(req.params.id)));
    if (!row) throw new DomainError("NOT_FOUND", "Agreement not found", 404);
    if (
      !who.demo &&
      ![
        row.data.buyerWallet,
        row.data.providerWallet,
        process.env.VERIFIER_PUBLIC_KEY,
      ].includes(who.wallet)
    )
      throw new DomainError("FORBIDDEN", "Agreement participant required", 403);
    const llm = configuredLLMVerifier();
    if (!llm)
      throw new DomainError(
        "LLM_UNAVAILABLE",
        "Optional advisory model is not configured",
        503,
      );
    if (!row.data.evidence)
      throw new DomainError("EVIDENCE_REQUIRED", "Submit evidence first");
    res.json(
      await llm.recommend(row.data.requirements, row.data.evidence.payload),
    );
  });
  app.get("/services", async (_req, res) =>
    res.json((await db.select().from(s.services)).map((r) => r.data)),
  );
  app.get("/services/:id", async (req, res) => {
    const [r] = await db
      .select()
      .from(s.services)
      .where(eq(s.services.slug, String(req.params.id)));
    if (!r) throw new DomainError("NOT_FOUND", "Service not found", 404);
    res.json(r.data);
  });
  app.post("/services", async (req, res) => {
    const who = await actor(req);
    const body = z
      .object({
        providerId: z.string(),
        slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
        name: z.string().min(1).max(100),
        description: z.string().max(2000),
        endpoint: z.string().url(),
        price: amountSchema,
      })
      .strict()
      .parse(req.body);
    const [provider] = await db
      .select()
      .from(s.agents)
      .where(eq(s.agents.id, body.providerId));
    if (
      !provider ||
      provider.data.type === "BUYER" ||
      (!who.demo && provider.data.publicKey !== who.wallet)
    )
      throw new DomainError(
        "FORBIDDEN",
        "Provider authorization required",
        403,
      );
    const allowed = (process.env.PROVIDER_ALLOWED_ORIGINS ?? "").split(",");
    if (!allowed.includes(new URL(body.endpoint).origin))
      throw new DomainError(
        "ENDPOINT_NOT_ALLOWED",
        "Operator must allowlist this provider origin",
        400,
      );
    if (BigInt(body.price.replace(".", "")) === 0n)
      throw new DomainError("INVALID_PRICE", "Price must be positive", 400);
    const data = {
      ...body,
      id: randomUUID(),
      currency: "pcUSD",
      category: "weather",
      verificationType: "JSON_SCHEMA" as const,
      active: true,
      demo: who.demo,
      createdAt: new Date().toISOString(),
    };
    await db.insert(s.services).values({
      id: data.id,
      slug: data.slug,
      providerId: data.providerId,
      data,
    });
    res.status(201).json(data);
  });
  app.get("/agents", async (_req, res) =>
    res.json((await db.select().from(s.agents)).map((r) => r.data)),
  );
  app.get("/agents/:id", async (req, res) => {
    const [r] = await db
      .select()
      .from(s.agents)
      .where(eq(s.agents.id, String(req.params.id)));
    if (!r) throw new DomainError("NOT_FOUND", "Agent not found", 404);
    res.json(r.data);
  });
  app.post("/agents", async (req, res) => {
    const who = await actor(req);
    const body = z
      .object({
        name: z.string().min(1).max(80),
        type: z.enum(["BUYER", "PROVIDER", "BOTH"]),
        publicKey: publicKey.optional(),
        policy: policySchema,
      })
      .strict()
      .parse(req.body);
    const id = randomUUID();
    let wallet = body.publicKey;
    if (!wallet) {
      if (!who.demo)
        throw new DomainError(
          "EXTERNAL_SIGNER_REQUIRED",
          "Connect an external wallet",
          400,
        );
      const key = Keypair.generate();
      await mkdir(".local/keys", { recursive: true });
      await writeFile(
        `.local/keys/${id}.json`,
        JSON.stringify([...key.secretKey]),
        { flag: "wx", mode: 0o600 },
      );
      wallet = key.publicKey.toBase58();
    }
    if (!who.demo && wallet !== who.wallet)
      throw new DomainError(
        "FORBIDDEN",
        "Wallet must match authenticated session",
        403,
      );
    const data: Agent = {
      id,
      name: body.name,
      type: body.type,
      policy: body.policy,
      publicKey: wallet,
      demo: who.demo,
      createdAt: new Date().toISOString(),
    };
    await db.insert(s.agents).values({ id, publicKey: wallet, data });
    res.status(201).json(data);
  });
  app.get("/agreements", async (_req, res) =>
    res.json(
      (await db.select().from(s.agreements).orderBy(desc(s.agreements.id)))
        .map((r) => r.data)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),
  );
  app.post("/agreements", async (req, res) =>
    res
      .status(201)
      .json(
        await workflow.create(
          createSchema.parse(req.body),
          await actor(req),
          idempotency(req),
        ),
      ),
  );
  app.get("/agreements/:id", async (req, res) => {
    const [r] = await db
      .select()
      .from(s.agreements)
      .where(eq(s.agreements.id, String(req.params.id)));
    if (!r) throw new DomainError("NOT_FOUND", "Agreement not found", 404);
    res.json(r.data);
  });
  app.get("/agreements/:id/events", async (req, res) =>
    res.json(
      (
        await db
          .select()
          .from(s.events)
          .where(eq(s.events.agreementId, String(req.params.id)))
          .orderBy(asc(s.events.sequence))
      ).map((r) => r.data),
    ),
  );
  for (const action of [
    "fund",
    "accept",
    "evidence",
    "verify",
    "settle",
    "refund",
    "cancel",
  ] as const)
    app.post(`/agreements/:id/${action}`, async (req, res) => {
      const body =
        action === "evidence"
          ? z
              .unknown()
              .refine((v) => v !== undefined)
              .parse(req.body)
          : z
              .object({})
              .strict()
              .parse(req.body ?? {});
      res.json(
        await workflow.action(
          String(req.params.id),
          action,
          body,
          await actor(req),
          idempotency(req),
        ),
      );
    });
  app.post("/agreements/:id/execute", async (req, res) => {
    const who = await actor(req);
    if (!who.demo)
      throw new DomainError(
        "DEMO_ONLY",
        "Providers submit signed deliveries through /evidence",
        403,
      );
    const [r] = await db
      .select()
      .from(s.agreements)
      .where(eq(s.agreements.id, String(req.params.id)));
    if (!r) throw new DomainError("NOT_FOUND", "Agreement not found", 404);
    const a = r.data;
    const cacheKey = `${who.wallet}:${a.id}:evidence:${idempotency(req)}`;
    const [cached] = await db
      .select()
      .from(s.idempotency)
      .where(eq(s.idempotency.key, cacheKey));
    if (cached) {
      res.json(cached.response);
      return;
    }
    const [service] = await db
      .select()
      .from(s.services)
      .where(eq(s.services.id, a.serviceId));
    if (a.status !== "ACCEPTED" && a.status !== "REJECTED")
      throw new DomainError(
        "BAD_TRANSITION",
        "Provider must accept before execution",
      );
    let payload: unknown;
    if (
      service.data.demo &&
      ["weather-7d", "weather-7d-malicious"].includes(service.data.slug)
    )
      payload = forecast(
        a.requirements,
        Date.parse(a.updatedAt),
        a.providerAgentId === "malicious" ? 5 : a.requirements.days,
      );
    else payload = await executeProvider(service.data.endpoint, a.requirements);
    res.json(
      await workflow.action(a.id, "evidence", payload, who, idempotency(req)),
    );
  });
  app.get("/reputation/:id", async (req, res) =>
    res.json(
      reputation(
        (
          await db
            .select()
            .from(s.agreements)
            .where(eq(s.agreements.providerId, String(req.params.id)))
        ).map((r) => r.data),
      ),
    ),
  );
  app.get("/events/stream", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const client = new pg.Client({ connectionString: config.DATABASE_URL });
    await client.connect();
    let cursor = Number(req.headers["last-event-id"] ?? req.query.after ?? 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;
    let draining = false,
      queued = false,
      closed = false;
    const drain = async () => {
      if (draining) {
        queued = true;
        return;
      }
      draining = true;
      try {
        do {
          queued = false;
          const rows = await db
            .select()
            .from(s.events)
            .where(
              req.query.agreementId
                ? and(
                    gt(s.events.sequence, cursor),
                    eq(s.events.agreementId, String(req.query.agreementId)),
                  )
                : gt(s.events.sequence, cursor),
            )
            .orderBy(asc(s.events.sequence))
            .limit(100);
          for (const row of rows) {
            if (closed) return;
            res.write(
              `id: ${row.sequence}\ndata: ${JSON.stringify(row.data)}\n\n`,
            );
            cursor = row.sequence;
          }
          if (rows.length === 100) queued = true;
        } while (queued && !closed);
      } catch {
        res.end();
      } finally {
        draining = false;
      }
    };
    await client.query("LISTEN proofcommerce_events");
    client.on("notification", drain);
    client.on("error", () => res.end());
    void drain();
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20000);
    res.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      client.removeListener("notification", drain);
      void client.end();
    });
  });
  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Route not found" } }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: "VALIDATION",
            message: error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          },
        });
        return;
      }
      const bodyStatus = (error as { status?: number }).status;
      if (bodyStatus === 400 || bodyStatus === 413) {
        res
          .status(bodyStatus)
          .json({
            error: {
              code: "INVALID_BODY",
              message:
                bodyStatus === 413
                  ? "Request body exceeds the size limit"
                  : "Request body must be valid JSON",
            },
          });
        return;
      }
      if (error instanceof DomainError) {
        res
          .status(error.httpStatus)
          .json({ error: { code: error.code, message: error.message } });
        return;
      }
      const code = (error as { code?: string }).code;
      if (code === "23505") {
        res.status(409).json({
          error: {
            code: "ALREADY_EXISTS",
            message: "Resource already exists",
          },
        });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "request.failed",
      );
      res.status(500).json({
        error: {
          code: "INTERNAL",
          message:
            "Request could not be completed. No unconfirmed payment is reported as successful.",
        },
      });
    },
  );
  return app;
}
