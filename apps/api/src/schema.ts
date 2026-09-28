import {
  pgTable,
  text,
  jsonb,
  timestamp,
  bigserial,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  Agent,
  Service,
  Agreement,
  Event,
  Evidence,
  Verification,
} from "../../../packages/shared/src/index.js";
export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull().unique(),
  data: jsonb("data").$type<Agent>().notNull(),
});
export const services = pgTable("services", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  providerId: text("provider_id")
    .notNull()
    .references(() => agents.id),
  data: jsonb("data").$type<Service>().notNull(),
});
export const agreements = pgTable("agreements", {
  id: text("id").primaryKey(),
  buyerId: text("buyer_id")
    .notNull()
    .references(() => agents.id),
  providerId: text("provider_id")
    .notNull()
    .references(() => agents.id),
  serviceId: text("service_id")
    .notNull()
    .references(() => services.id),
  data: jsonb("data").$type<Agreement>().notNull(),
});
export const events = pgTable("events", {
  sequence: bigserial("sequence", { mode: "number" }).primaryKey(),
  id: text("id").notNull().unique(),
  agreementId: text("agreement_id")
    .notNull()
    .references(() => agreements.id),
  data: jsonb("data").$type<Event>().notNull(),
});
export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  agreementId: text("agreement_id")
    .notNull()
    .references(() => agreements.id),
  data: jsonb("data").$type<Evidence>().notNull(),
});
export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  agreementId: text("agreement_id")
    .notNull()
    .references(() => agreements.id),
  data: jsonb("data").$type<Verification>().notNull(),
});
export const payments = pgTable("payments", {
  signature: text("signature").primaryKey(),
  agreementId: text("agreement_id")
    .notNull()
    .references(() => agreements.id),
  kind: text("kind").notNull(),
  amount: text("amount").notNull(),
});
export const idempotency = pgTable("idempotency", {
  key: text("key").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const nonces = pgTable("nonces", {
  nonce: text("nonce").primaryKey(),
  wallet: text("wallet").notNull(),
  expires: timestamp("expires").notNull(),
});
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    wallet: text("wallet").notNull(),
    expires: timestamp("expires").notNull(),
  },
  (t) => [uniqueIndex("sessions_hash").on(t.tokenHash)],
);
