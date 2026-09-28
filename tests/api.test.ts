import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { eq, sql } from "drizzle-orm";
import { createApp } from "../apps/api/src/app.js";
import { db, pool } from "../apps/api/src/db.js";
import * as s from "../apps/api/src/schema.js";
import {
  Keypair,
  type EscrowGateway,
  type ChainAction,
  type ChainState,
} from "../packages/solana/src/index.js";
import {
  type Agreement,
  type Agent,
  type Service,
  units,
} from "../packages/shared/src/index.js";
import { forecast } from "../examples/weather-provider/index.js";
import { hash } from "../packages/verifier/src/index.js";
import { journalPool } from "../apps/api/src/journal.js";

// Explicit test double, injected only in tests. It is not imported by the application.
class RecordingChain implements EscrowGateway {
  states = new Map<string, ChainState>();
  calls: ChainAction[] = [];
  address(a: Agreement) {
    return `TEST_ONLY_PDA_${a.id}`;
  }
  async health() {
    return true;
  }
  async state(a: Agreement) {
    return this.states.get(a.id) ?? null;
  }
  async execute(action: ChainAction, a: Agreement, approved = true) {
    this.calls.push(action);
    const state = {
      initialize: "CREATED",
      fund: "FUNDED",
      accept: "ACCEPTED",
      submit: "SUBMITTED",
      approve: approved ? "VERIFIED" : "REJECTED",
      settle: "SETTLED",
      refund: "REFUNDED",
      cancel: "CANCELLED",
    }[action];
    this.states.set(a.id, {
      state,
      hash: a.evidence?.contentHash ?? "",
      requirementsHash: a.requirementsHash,
      amount: units(a.amount),
      buyer: a.buyerWallet,
      provider: a.providerWallet,
      mint: a.mint,
      verifier: "test-verifier",
      deadline: a.deadline,
    });
    return `TEST_ONLY_NOT_A_SOLANA_SIGNATURE_${randomUUID()}`;
  }
}
const prefix = `test-${randomUUID()}`,
  buyerId = `${prefix}-buyer`,
  providerId = `${prefix}-provider`,
  serviceId = `${prefix}-service`,
  mint = Keypair.generate().publicKey.toBase58(),
  buyerKey = Keypair.generate(),
  providerKey = Keypair.generate(),
  chain = new RecordingChain(),
  app = createApp(async () => chain, mint);
let buyerToken = "",
  providerToken = "";
async function login(key: Keypair) {
  const challenge = await request(app)
    .post("/auth/nonce")
    .send({ wallet: key.publicKey.toBase58() });
  const response = await request(app)
    .post("/auth/verify")
    .send({
      wallet: key.publicKey.toBase58(),
      nonce: challenge.body.nonce,
      signature: bs58.encode(
        nacl.sign.detached(Buffer.from(challenge.body.message), key.secretKey),
      ),
    });
  expect(response.status).toBe(200);
  return response.body.token as string;
}
const headers = (token: string, key: string = randomUUID()) => ({
  Authorization: `Bearer ${token}`,
  "Idempotency-Key": key,
});
const input = {
  buyerAgentId: buyerId,
  service: serviceId,
  requirements: { city: "Lima", country: "PE", days: 7 },
  maxPrice: "0.05",
};
async function create() {
  const response = await request(app)
    .post("/agreements")
    .set(headers(buyerToken))
    .send(input);
  expect(response.status).toBe(201);
  return response.body as Agreement;
}
async function action(
  a: Agreement,
  action: string,
  body: object = {},
  token = buyerToken,
  key?: string,
) {
  return request(app)
    .post(`/agreements/${a.id}/${action}`)
    .set(headers(token, key))
    .send(body);
}
beforeAll(async () => {
  const policy = {
    maxPerTransaction: "1",
    dailyBudget: "10",
    allowedServices: ["weather"],
    allowedProviders: [providerId],
    allowedMints: [mint],
  };
  for (const [id, name, k, type] of [
    [buyerId, "Test buyer", buyerKey, "BUYER"],
    [providerId, "Test provider", providerKey, "PROVIDER"],
  ] as const) {
    const data: Agent = {
      id,
      name,
      publicKey: k.publicKey.toBase58(),
      type,
      policy,
      demo: true,
      createdAt: new Date().toISOString(),
    };
    await db.insert(s.agents).values({ id, publicKey: data.publicKey, data });
  }
  const data: Service = {
    id: serviceId,
    slug: serviceId,
    providerId,
    name: "Integration service",
    description: "Test fixture",
    endpoint: "http://127.0.0.1:4101/execute",
    price: "0.04",
    currency: "pcUSD",
    category: "weather",
    verificationType: "JSON_SCHEMA",
    active: true,
    demo: true,
    createdAt: new Date().toISOString(),
  };
  await db
    .insert(s.services)
    .values({ id: serviceId, slug: serviceId, providerId, data });
  buyerToken = await login(buyerKey);
  providerToken = await login(providerKey);
  process.env.VERIFIER_PUBLIC_KEY = buyerKey.publicKey.toBase58();
});
afterAll(async () => {
  await db.execute(
    sql`delete from idempotency where key like ${buyerKey.publicKey.toBase58() + "%"} or key like ${providerKey.publicKey.toBase58() + "%"}`,
  );
  for (const table of [
    "verification_intents",
    "payments",
    "verifications",
    "evidence",
    "events",
  ])
    await pool.query(
      `DELETE FROM ${table} WHERE agreement_id IN (SELECT id FROM agreements WHERE buyer_id = $1)`,
      [buyerId],
    );
  await db.delete(s.agreements).where(eq(s.agreements.buyerId, buyerId));
  await db.delete(s.services).where(eq(s.services.id, serviceId));
  await db.delete(s.agents).where(eq(s.agents.id, buyerId));
  await db.delete(s.agents).where(eq(s.agents.id, providerId));
  for (const wallet of [
    buyerKey.publicKey.toBase58(),
    providerKey.publicKey.toBase58(),
  ]) {
    await db.delete(s.sessions).where(eq(s.sessions.wallet, wallet));
    await db.delete(s.nonces).where(eq(s.nonces.wallet, wallet));
  }
  delete process.env.VERIFIER_PUBLIC_KEY;
  await pool.end();
  await journalPool.end();
});
describe("PostgreSQL-backed API", () => {
  it("requires authentication for mutations", async () =>
    expect((await request(app).post("/agreements").send(input)).status).toBe(
      401,
    ));
  it("requires an idempotency key", async () =>
    expect(
      (
        await request(app)
          .post("/agreements")
          .set("Authorization", `Bearer ${buyerToken}`)
          .send(input)
      ).status,
    ).toBe(400));
  it("rejects unknown request fields", async () =>
    expect(
      (
        await request(app)
          .post("/agreements")
          .set(headers(buyerToken))
          .send({ ...input, amount: "0" })
      ).status,
    ).toBe(400));
  it("prevents wallet challenge replay", async () => {
    const n = await request(app)
      .post("/auth/nonce")
      .send({ wallet: buyerKey.publicKey.toBase58() });
    const payload = {
      wallet: buyerKey.publicKey.toBase58(),
      nonce: n.body.nonce,
      signature: bs58.encode(
        nacl.sign.detached(Buffer.from(n.body.message), buyerKey.secretKey),
      ),
    };
    expect((await request(app).post("/auth/verify").send(payload)).status).toBe(
      200,
    );
    expect((await request(app).post("/auth/verify").send(payload)).status).toBe(
      401,
    );
  });
  it("enforces idempotency fingerprint and ownership", async () => {
    const key = randomUUID();
    const first = await request(app)
      .post("/agreements")
      .set(headers(buyerToken, key))
      .send(input);
    const again = await request(app)
      .post("/agreements")
      .set(headers(buyerToken, key))
      .send(input);
    expect(again.body.id).toBe(first.body.id);
    expect(
      (
        await request(app)
          .post("/agreements")
          .set(headers(buyerToken, key))
          .send({ ...input, maxPrice: "0.06" })
      ).status,
    ).toBe(409);
    expect((await action(first.body, "fund", {}, providerToken)).status).toBe(
      403,
    );
  });
  it("funds once under concurrent HTTP retries", async () => {
    const a = await create(),
      key = randomUUID(),
      before = chain.calls.filter((c) => c === "fund").length;
    const responses = await Promise.all([
      action(a, "fund", {}, buyerToken, key),
      action(a, "fund", {}, buyerToken, key),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(chain.calls.filter((c) => c === "fund").length - before).toBe(1);
    expect(responses[0].body.transactions.fund).toBe(
      responses[1].body.transactions.fund,
    );
  });
  it("settles verified evidence exactly once across two workers", async () => {
    const a = await create();
    expect((await action(a, "fund")).status).toBe(200);
    expect((await action(a, "accept", {}, providerToken)).status).toBe(200);
    expect((await action(a, "refund")).status).toBe(409);
    const payload = forecast(input.requirements);
    expect((await action(a, "evidence", payload, providerToken)).status).toBe(
      200,
    );
    const verified = await action(a, "verify");
    expect(verified.body.verification.status).toBe("PASS");
    expect(verified.body.evidence.contentHash).toBe(hash(payload));
    const outcomes = await Promise.all([
      action(a, "settle"),
      action(a, "settle"),
      action(a, "refund"),
    ]);
    expect(outcomes.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await action(a, "refund")).status).toBe(409);
    expect((await action(a, "settle")).status).toBe(409);
  });
  it("blocks five-day delivery, refunds, and cannot settle afterward", async () => {
    const a = await create();
    await action(a, "fund");
    await action(a, "accept", {}, providerToken);
    await action(
      a,
      "evidence",
      forecast(input.requirements, Date.now(), 5),
      providerToken,
    );
    const checked = await action(a, "verify");
    expect(checked.body.status).toBe("REJECTED");
    expect(
      checked.body.verification.checks.find(
        (c: { name: string }) => c.name === "days",
      ),
    ).toMatchObject({ expected: 7, actual: 5, status: "FAIL" });
    expect((await action(a, "settle")).status).toBe(409);
    expect((await action(a, "refund")).body.status).toBe("REFUNDED");
    expect((await action(a, "settle")).status).toBe(409);
  });
  it("rejects commitment substitution before approving", async () => {
    const a = await create();
    await action(a, "fund");
    await action(a, "accept", {}, providerToken);
    await action(a, "evidence", forecast(input.requirements), providerToken);
    chain.states.get(a.id)!.hash = "0".repeat(64);
    expect((await action(a, "verify")).body.verification.status).toBe("FAIL");
    expect((await action(a, "settle")).status).toBe(409);
  });
  it("publishes ordered durable events and real derived reputation", async () => {
    const a = await create();
    await action(a, "fund");
    const events = await request(app).get(`/agreements/${a.id}/events`);
    expect(events.body.map((e: { type: string }) => e.type)).toEqual([
      "agreement.created",
      "agreement.funded",
    ]);
    const rep = await request(app).get(`/reputation/${providerId}`);
    expect(rep.body.jobsPassed).toBe(1);
    expect(rep.body.jobsFailed).toBe(1);
    expect(rep.body.totalVolume).toBe("40000");
  });
});
