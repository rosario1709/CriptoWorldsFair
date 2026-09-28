import { describe, it, expect } from "vitest";
import {
  PolicyEngine,
  units,
  assertTransition,
  reputation,
  type Policy,
} from "../packages/shared/src/index.js";
import { hash, canonicalize, verify } from "../packages/verifier/src/index.js";
const policy: Policy = {
  maxPerTransaction: "1",
  dailyBudget: "10",
  allowedServices: ["weather"],
  allowedProviders: ["provider"],
  allowedMints: ["mint"],
};
describe("monetary policy", () => {
  const purchase = {
    amount: "0.04",
    service: "weather",
    provider: "provider",
    mint: "mint",
  };
  it("uses integer base units", () => expect(units("0.040001")).toBe(40001n));
  it("allows exact budget boundary", () =>
    expect(new PolicyEngine().evaluate(policy, purchase, 9960000n)).toBe(
      "ALLOW",
    ));
  it.each([
    { amount: "1.01" },
    { mint: "attacker" },
    { provider: "attacker" },
    { service: "unlisted" },
    { amount: "0" },
  ])("denies unsafe purchase %o", (override) =>
    expect(
      new PolicyEngine().evaluate(policy, { ...purchase, ...override }, 0n),
    ).toBe("DENY"),
  );
  it("denies cumulative overspending", () =>
    expect(new PolicyEngine().evaluate(policy, purchase, 9960001n)).toBe(
      "DENY",
    ));
  it.each(["-1", "NaN", "0.0000001", "1e9"])(
    "rejects invalid amount %s",
    (amount) => expect(() => units(amount)).toThrow(),
  );
});
describe("evidence", () => {
  const now = Date.now(),
    requirements = { city: "Lima", country: "PE", days: 7 };
  const payload = {
    ...requirements,
    days: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(now + i * 86400000).toISOString().slice(0, 10),
      temperatureC: 21,
      condition: "Cloudy",
    })),
    generatedAt: new Date(now).toISOString(),
  };
  it("hashes keys deterministically", () =>
    expect(hash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      hash({ a: { c: 3, d: 4 }, b: 2 }),
    ));
  it("rejects non JSON values", () =>
    expect(() => canonicalize({ n: NaN })).toThrow());
  it("accepts complete evidence", () =>
    expect(
      verify({ requirements, payload, commitment: hash(payload), now }).status,
    ).toBe("PASS"));
  it("rejects the malicious five day result", () => {
    const bad = { ...payload, days: payload.days.slice(0, 5) };
    expect(
      verify({
        requirements,
        payload: bad,
        commitment: hash(bad),
        now,
      }).checks.find((c) => c.name === "days"),
    ).toMatchObject({ status: "FAIL", expected: 7, actual: 5 });
  });
  it("rejects commitment substitution", () =>
    expect(
      verify({ requirements, payload, commitment: "0".repeat(64), now }).status,
    ).toBe("FAIL"));
  it("rejects stale evidence", () =>
    expect(
      verify({
        requirements,
        payload,
        commitment: hash(payload),
        now: now + 360000,
      }).status,
    ).toBe("FAIL"));
});
describe("terminal states", () => {
  it.each(["SETTLED", "REFUNDED", "CANCELLED"] as const)(
    "cannot pay or refund from %s",
    (s) => {
      expect(() => assertTransition(s, "SETTLED")).toThrow();
      expect(() => assertTransition(s, "REFUNDED")).toThrow();
    },
  );
  it("has no invented reputation", () =>
    expect(reputation([])).toMatchObject({
      jobsCompleted: 0,
      totalVolume: "0",
      score: 0,
    }));
});
