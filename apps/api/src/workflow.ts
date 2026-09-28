import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, type Tx } from "./db.js";
import * as s from "./schema.js";
import {
  DomainError,
  PolicyEngine,
  units,
  assertTransition,
  type Agreement,
  type Event,
  type Evidence,
  type Status,
} from "../../../packages/shared/src/index.js";
import { hash, verify } from "../../../packages/verifier/src/index.js";
import type {
  EscrowGateway,
  ChainAction,
} from "../../../packages/solana/src/index.js";
import { config } from "./config.js";
import pino from "pino";
import { getDecision, saveDecision } from "./journal.js";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.authorization", "secretKey", "token", "password"],
});
export interface Actor {
  wallet: string;
  demo: boolean;
}
export type GatewayFactory = (a: Agreement) => Promise<EscrowGateway>;
export class Workflow {
  constructor(
    private gateway: GatewayFactory,
    private mint = config.PAYMENT_TOKEN_MINT,
  ) {}
  private authorize(
    a: Agreement,
    actor: Actor,
    role: "buyer" | "provider" | "verifier",
  ) {
    if (actor.demo && config.demo) return;
    const wallet =
      role === "buyer"
        ? a.buyerWallet
        : role === "provider"
          ? a.providerWallet
          : process.env.VERIFIER_PUBLIC_KEY;
    if (!wallet || wallet !== actor.wallet)
      throw new DomainError(
        "FORBIDDEN",
        `The ${role} must authorize this action`,
        403,
      );
  }
  private async event(
    tx: Tx,
    a: Agreement,
    type: string,
    actor: string,
    transaction?: string,
  ) {
    const event: Event = {
      id: randomUUID(),
      agreementId: a.id,
      type,
      actor,
      at: new Date().toISOString(),
      correlationId: a.correlationId,
      ...(transaction ? { transaction } : {}),
    };
    await tx
      .insert(s.events)
      .values({ id: event.id, agreementId: a.id, data: event });
    await tx.execute(sql`select pg_notify('proofcommerce_events', ${a.id})`);
    logger.info(
      {
        event: type,
        agreementId: a.id,
        correlationId: a.correlationId,
        transaction,
      },
      type,
    );
  }
  private async cached(tx: Tx, key: string, fingerprint: string) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
    const [old] = await tx
      .select()
      .from(s.idempotency)
      .where(eq(s.idempotency.key, key));
    if (old && old.fingerprint !== fingerprint)
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "This key was already used for different input",
      );
    return old?.response as Agreement | undefined;
  }
  async create(
    input: {
      buyerAgentId: string;
      service: string;
      requirements: Agreement["requirements"];
      maxPrice: string;
      deadlineSeconds: number;
    },
    actor: Actor,
    key: string,
  ) {
    return db.transaction(async (tx) => {
      const fingerprint = hash(input),
        cacheKey = `${actor.wallet}:create:${key}`;
      const cached = await this.cached(tx, cacheKey, fingerprint);
      if (cached) return cached;
      const [buyer] = await tx
        .select()
        .from(s.agents)
        .where(eq(s.agents.id, input.buyerAgentId))
        .for("update");
      const [service] = await tx
        .select()
        .from(s.services)
        .where(eq(s.services.slug, input.service));
      if (!buyer || !service)
        throw new DomainError("NOT_FOUND", "Buyer or service not found", 404);
      if (!actor.demo && actor.wallet !== buyer.data.publicKey)
        throw new DomainError(
          "FORBIDDEN",
          "Buyer wallet authorization required",
          403,
        );
      if (buyer.data.type === "PROVIDER")
        throw new DomainError(
          "POLICY_DENIED",
          "Provider-only agent cannot purchase",
        );
      const [provider] = await tx
        .select()
        .from(s.agents)
        .where(eq(s.agents.id, service.providerId));
      if (!provider || !service.data.active || buyer.id === provider.id)
        throw new DomainError(
          "UNAVAILABLE_SERVICE",
          "Service cannot be purchased",
        );
      if (!this.mint)
        throw new DomainError(
          "CHAIN_UNAVAILABLE",
          "Create the test mint and configure PAYMENT_TOKEN_MINT before purchasing",
          503,
        );
      if (units(service.data.price) > units(input.maxPrice))
        throw new DomainError("PRICE_LIMIT", "Service exceeds maximum price");
      const previous = await tx
        .select()
        .from(s.agreements)
        .where(eq(s.agreements.buyerId, buyer.id));
      const today = new Date().toISOString().slice(0, 10);
      const reserved = previous
        .filter(
          (x) =>
            x.data.createdAt.startsWith(today) &&
            !["REFUNDED", "CANCELLED"].includes(x.data.status),
        )
        .reduce((sum, x) => sum + units(x.data.amount), 0n);
      if (
        new PolicyEngine().evaluate(
          buyer.data.policy,
          {
            amount: service.data.price,
            service: service.data.category,
            provider: provider.id,
            mint: this.mint,
          },
          reserved,
        ) !== "ALLOW"
      )
        throw new DomainError(
          "POLICY_DENIED",
          "Purchase violates the agent spending policy",
          403,
        );
      const now = new Date().toISOString();
      const a: Agreement = {
        id: randomUUID(),
        correlationId: randomUUID(),
        buyerAgentId: buyer.id,
        providerAgentId: provider.id,
        serviceId: service.id,
        amount: service.data.price,
        mint: this.mint,
        buyerWallet: buyer.data.publicKey,
        providerWallet: provider.data.publicKey,
        requirements: input.requirements,
        requirementsHash: hash(input.requirements),
        status: "CREATED",
        deadline: Math.floor(Date.now() / 1000) + input.deadlineSeconds,
        createdAt: now,
        updatedAt: now,
        transactions: {},
        demo: actor.demo,
      };
      await tx.insert(s.agreements).values({
        id: a.id,
        buyerId: buyer.id,
        providerId: provider.id,
        serviceId: service.id,
        data: a,
      });
      await this.event(tx, a, "agreement.created", actor.wallet);
      await tx
        .insert(s.idempotency)
        .values({ key: cacheKey, fingerprint, response: a });
      return a;
    });
  }
  async action(
    id: string,
    action:
      | "fund"
      | "accept"
      | "evidence"
      | "verify"
      | "settle"
      | "refund"
      | "cancel",
    body: unknown,
    actor: Actor,
    key: string,
  ) {
    return db.transaction(async (tx) => {
      const fingerprint = hash({ id, action, body }),
        cacheKey = `${actor.wallet}:${id}:${action}:${key}`;
      const cached = await this.cached(tx, cacheKey, fingerprint);
      if (cached) return cached;
      const [row] = await tx
        .select()
        .from(s.agreements)
        .where(eq(s.agreements.id, id))
        .for("update");
      if (!row) throw new DomainError("NOT_FOUND", "Agreement not found", 404);
      const a: Agreement = structuredClone(row.data);
      this.authorize(
        a,
        actor,
        action === "accept" || action === "evidence"
          ? "provider"
          : action === "verify" || action === "settle"
            ? "verifier"
            : "buyer",
      );
      const chain = await this.gateway(a);
      const send = async (op: ChainAction, approved?: boolean) => {
        const signature = await chain.execute(op, a, approved);
        a.transactions[op] = signature;
        await tx
          .insert(s.payments)
          .values({ signature, agreementId: id, kind: op, amount: a.amount })
          .onConflictDoNothing();
        return signature;
      };
      const move = async (to: Status, event: string, signature?: string) => {
        assertTransition(a.status, to);
        a.status = to;
        await this.event(tx, a, event, actor.wallet, signature);
      };
      if (action === "fund") {
        assertTransition(a.status, "FUNDED");
        a.escrowAddress = chain.address(a);
        await send("initialize");
        await move("FUNDED", "agreement.funded", await send("fund"));
      } else if (action === "accept") {
        assertTransition(a.status, "ACCEPTED");
        await move("ACCEPTED", "provider.accepted", await send("accept"));
      } else if (action === "evidence") {
        assertTransition(a.status, "SUBMITTED");
        const evidence: Evidence = {
          payload: body,
          contentHash: hash(body),
          submittedAt: new Date().toISOString(),
        };
        a.evidence = evidence;
        const signature = await send("submit");
        await tx
          .insert(s.evidence)
          .values({ id: randomUUID(), agreementId: id, data: evidence });
        delete a.verification;
        await move("SUBMITTED", "evidence.submitted", signature);
      } else if (action === "verify") {
        if (a.status !== "SUBMITTED" || !a.evidence)
          throw new DomainError(
            "BAD_TRANSITION",
            "An on-chain delivery is required",
          );
        const onchain = await chain.state(a);
        if (
          !onchain ||
          !["SUBMITTED", "VERIFIED", "REJECTED"].includes(onchain.state)
        )
          throw new DomainError(
            "CHAIN_MISMATCH",
            "Delivery is not awaiting verification",
          );
        await this.event(tx, a, "verification.started", actor.wallet);
        const decisionKey = `${id}:${a.evidence.contentHash}:${a.evidence.submittedAt}`;
        const intent = await getDecision(decisionKey);
        if (intent && intent.content_hash !== onchain.hash)
          throw new DomainError(
            "CHAIN_MISMATCH",
            "Recovery commitment changed",
          );
        a.verification =
          intent?.data ??
          verify({
            requirements: a.requirements,
            payload: a.evidence.payload,
            commitment: onchain.hash,
            now: Date.now(),
          });
        if (!intent)
          await saveDecision(decisionKey, id, onchain.hash, a.verification);
        const pass = a.verification.status === "PASS";
        const signature = await send("approve", pass);
        await tx
          .insert(s.verifications)
          .values({ id: randomUUID(), agreementId: id, data: a.verification });
        await move(
          pass ? "VERIFIED" : "REJECTED",
          pass ? "verification.passed" : "verification.failed",
          signature,
        );
      } else if (action === "settle") {
        assertTransition(a.status, "SETTLED");
        if (a.verification?.status !== "PASS")
          throw new DomainError(
            "VERIFICATION_REQUIRED",
            "Deterministic verification must pass",
          );
        await this.event(tx, a, "settlement.started", actor.wallet);
        await move("SETTLED", "settlement.completed", await send("settle"));
      } else if (action === "refund") {
        assertTransition(a.status, "REFUNDED");
        if (a.status !== "REJECTED" && Date.now() < a.deadline * 1000)
          throw new DomainError(
            "DEADLINE",
            "Refund requires verifier rejection or expiry",
          );
        await move("REFUNDED", "refund.completed", await send("refund"));
      } else {
        assertTransition(a.status, "CANCELLED");
        const onchain = await chain.state(a);
        if (onchain) await send("cancel");
        await move("CANCELLED", "agreement.cancelled", a.transactions.cancel);
      }
      a.updatedAt = new Date().toISOString();
      await tx
        .update(s.agreements)
        .set({ data: a })
        .where(eq(s.agreements.id, id));
      await tx
        .insert(s.idempotency)
        .values({ key: cacheKey, fingerprint, response: a });
      return a;
    });
  }
}
