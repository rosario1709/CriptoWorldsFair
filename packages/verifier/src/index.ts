import { createHash } from "node:crypto";
import Ajv from "ajv";
import type {
  Check,
  Requirements,
  Verification,
} from "../../shared/src/index.js";

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (
    typeof value === "object" &&
    value &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  throw new Error("Evidence must be finite JSON data");
}
export const hash = (value: unknown) =>
  createHash("sha256").update(canonicalize(value)).digest("hex");
export interface VerificationContext {
  requirements: Requirements;
  payload: unknown;
  commitment: string;
  now: number;
}
export interface Verifier {
  verify(context: VerificationContext): Check[];
}
const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const weatherSchema = {
  type: "object",
  required: ["city", "country", "days", "generatedAt"],
  additionalProperties: false,
  properties: {
    city: { type: "string" },
    country: { type: "string" },
    generatedAt: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        required: ["date", "temperatureC", "condition"],
        additionalProperties: false,
        properties: {
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          temperatureC: { type: "number", minimum: -100, maximum: 70 },
          condition: { type: "string", minLength: 1, maxLength: 100 },
        },
      },
    },
  },
};
const validate = new Ajv({ allErrors: true }).compile(weatherSchema);
export class JsonSchemaVerifier implements Verifier {
  verify(c: VerificationContext): Check[] {
    return [
      {
        name: "JSON schema",
        status: validate(c.payload) ? "PASS" : "FAIL",
        expected: "Weather result schema",
        actual:
          validate.errors?.map((e) => `${e.instancePath} ${e.message}`) ??
          "Valid",
      },
    ];
  }
}
export class FieldVerifier implements Verifier {
  verify(c: VerificationContext): Check[] {
    return (["city", "country"] as const).map((name) => ({
      name,
      status:
        object(c.payload)[name] === c.requirements[name] ? "PASS" : "FAIL",
      expected: c.requirements[name],
      actual: object(c.payload)[name] ?? null,
    }));
  }
}
export class CountVerifier implements Verifier {
  verify(c: VerificationContext): Check[] {
    const days = object(c.payload).days;
    return [
      {
        name: "days",
        status:
          Array.isArray(days) && days.length === c.requirements.days
            ? "PASS"
            : "FAIL",
        expected: c.requirements.days,
        actual: Array.isArray(days) ? days.length : 0,
      },
    ];
  }
}
export class HashVerifier implements Verifier {
  verify(c: VerificationContext): Check[] {
    return [
      {
        name: "On-chain commitment",
        status: hash(c.payload) === c.commitment ? "PASS" : "FAIL",
        expected: c.commitment,
        actual: hash(c.payload),
      },
    ];
  }
}
export class TimestampVerifier implements Verifier {
  verify(c: VerificationContext): Check[] {
    const at = Date.parse(String(object(c.payload).generatedAt));
    return [
      {
        name: "Fresh timestamp",
        status:
          Number.isFinite(at) && at <= c.now + 30000 && at >= c.now - 300000
            ? "PASS"
            : "FAIL",
        expected: "Within 5 minutes; at most 30 seconds ahead",
        actual: object(c.payload).generatedAt ?? null,
      },
    ];
  }
}
export class DateSequenceVerifier implements Verifier {
  verify(c: VerificationContext): Check[] {
    const days = object(c.payload).days;
    const start = Date.parse(String(object(c.payload).generatedAt));
    const valid =
      Number.isFinite(start) &&
      Array.isArray(days) &&
      days.every(
        (d, i) =>
          object(d).date ===
          new Date(start + i * 86400000).toISOString().slice(0, 10),
      );
    return [
      { name: "Consecutive forecast dates", status: valid ? "PASS" : "FAIL" },
    ];
  }
}
export function verify(c: VerificationContext): Verification {
  const checks = [
    new JsonSchemaVerifier(),
    new FieldVerifier(),
    new CountVerifier(),
    new HashVerifier(),
    new TimestampVerifier(),
    new DateSequenceVerifier(),
  ].flatMap((v) => v.verify(c));
  const status = checks.every((c) => c.status === "PASS") ? "PASS" : "FAIL";
  return {
    status,
    score: checks.filter((c) => c.status === "PASS").length / checks.length,
    checks,
    reason:
      status === "PASS"
        ? "All deterministic delivery checks passed."
        : "Verification failed. Funds remain protected.",
    createdAt: new Date(c.now).toISOString(),
  };
}
/** Advisory only. No transaction or settlement capabilities are exposed. */
export interface LLMVerifier {
  recommend(
    requirements: unknown,
    evidence: unknown,
  ): Promise<{ score: number; reason: string; advisory: true }>;
}
