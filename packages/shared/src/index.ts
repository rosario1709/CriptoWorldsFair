import { z } from "zod";

export const statuses = [
  "CREATED",
  "FUNDED",
  "ACCEPTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "VERIFYING",
  "VERIFIED",
  "REJECTED",
  "SETTLED",
  "REFUNDED",
  "CANCELLED",
  "EXPIRED",
  "DISPUTED",
] as const;
export type Status = (typeof statuses)[number];
export const requirementsSchema = z
  .object({
    city: z.string().min(1).max(100),
    country: z.string().regex(/^[A-Z]{2}$/),
    days: z.number().int().min(1).max(14),
  })
  .strict();
export type Requirements = z.infer<typeof requirementsSchema>;
export const amountSchema = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,6})?$/);
export function units(value: string): bigint {
  amountSchema.parse(value);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function displayUnits(value: string | bigint): string {
  const n = BigInt(value);
  return `${n / 1_000_000n}.${(n % 1_000_000n).toString().padStart(6, "0")}`;
}
export const policySchema = z.object({
  maxPerTransaction: amountSchema,
  dailyBudget: amountSchema,
  allowedServices: z.array(z.string()),
  allowedProviders: z.array(z.string()),
  allowedMints: z.array(z.string()),
});
export type Policy = z.infer<typeof policySchema>;
export interface Agent {
  id: string;
  name: string;
  publicKey: string;
  type: "BUYER" | "PROVIDER" | "BOTH";
  policy: Policy;
  demo: boolean;
  createdAt: string;
}
export interface Service {
  id: string;
  providerId: string;
  slug: string;
  name: string;
  description: string;
  endpoint: string;
  price: string;
  currency: string;
  category: string;
  verificationType: "JSON_SCHEMA";
  active: boolean;
  demo: boolean;
  createdAt: string;
}
export interface Check {
  name: string;
  status: "PASS" | "FAIL" | "INCONCLUSIVE";
  expected?: unknown;
  actual?: unknown;
}
export interface Verification {
  status: "PASS" | "FAIL" | "INCONCLUSIVE";
  score: number;
  checks: Check[];
  reason: string;
  createdAt: string;
}
export interface Evidence {
  payload: unknown;
  contentHash: string;
  submittedAt: string;
}
export interface Agreement {
  id: string;
  correlationId: string;
  buyerAgentId: string;
  providerAgentId: string;
  serviceId: string;
  amount: string;
  mint: string;
  buyerWallet: string;
  providerWallet: string;
  requirements: Requirements;
  requirementsHash: string;
  status: Status;
  deadline: number;
  createdAt: string;
  updatedAt: string;
  escrowAddress?: string;
  evidence?: Evidence;
  verification?: Verification;
  transactions: Partial<
    Record<
      | "initialize"
      | "fund"
      | "accept"
      | "submit"
      | "approve"
      | "settle"
      | "refund"
      | "cancel",
      string
    >
  >;
  demo: boolean;
}
export interface Event {
  id: string;
  agreementId: string;
  type: string;
  actor: string;
  at: string;
  transaction?: string;
  correlationId: string;
}
export interface Reputation {
  jobsCompleted: number;
  jobsPassed: number;
  jobsFailed: number;
  successRate: number;
  score: number;
  totalVolume: string;
  averageResponseTime: number;
  disputes: number;
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 409,
  ) {
    super(message);
  }
}
export const transitions: Record<Status, Status[]> = {
  CREATED: ["FUNDED", "CANCELLED"],
  FUNDED: ["ACCEPTED", "REFUNDED"],
  ACCEPTED: ["IN_PROGRESS", "SUBMITTED", "REFUNDED"],
  IN_PROGRESS: ["SUBMITTED", "REFUNDED"],
  SUBMITTED: ["VERIFYING", "VERIFIED", "REJECTED", "REFUNDED"],
  VERIFYING: ["VERIFIED", "REJECTED"],
  VERIFIED: ["SETTLED"],
  REJECTED: ["SUBMITTED", "REFUNDED"],
  SETTLED: [],
  REFUNDED: [],
  CANCELLED: [],
  EXPIRED: ["REFUNDED"],
  DISPUTED: [],
};
export function assertTransition(from: Status, to: Status) {
  if (!transitions[from].includes(to))
    throw new DomainError(
      "BAD_TRANSITION",
      `${from} cannot transition to ${to}`,
    );
}
export class PolicyEngine {
  evaluate(
    policy: Policy,
    purchase: {
      amount: string;
      service: string;
      provider: string;
      mint: string;
    },
    spent: bigint,
  ): "ALLOW" | "DENY" {
    const value = units(purchase.amount);
    return value > 0n &&
      value <= units(policy.maxPerTransaction) &&
      value + spent <= units(policy.dailyBudget) &&
      policy.allowedServices.includes(purchase.service) &&
      policy.allowedProviders.includes(purchase.provider) &&
      policy.allowedMints.includes(purchase.mint)
      ? "ALLOW"
      : "DENY";
  }
}
export function reputation(agreements: Agreement[]): Reputation {
  const completed = agreements.filter(
    (a) => a.status === "SETTLED" || a.status === "REFUNDED",
  );
  const passed = completed.filter((a) => a.status === "SETTLED");
  const failed = completed.filter((a) => a.verification?.status === "FAIL");
  const rate = completed.length ? passed.length / completed.length : 0;
  return {
    jobsCompleted: completed.length,
    jobsPassed: passed.length,
    jobsFailed: failed.length,
    successRate: rate,
    score: Math.round(rate * 100),
    totalVolume: passed.reduce((s, a) => s + units(a.amount), 0n).toString(),
    averageResponseTime: completed.length
      ? Math.round(
          completed.reduce(
            (s, a) => s + Date.parse(a.updatedAt) - Date.parse(a.createdAt),
            0,
          ) / completed.length,
        )
      : 0,
    disputes: agreements.filter((a) => a.status === "DISPUTED").length,
  };
}
