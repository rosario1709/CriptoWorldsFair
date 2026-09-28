import { randomBytes, createHash } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { eq, gt, and } from "drizzle-orm";
import { db } from "./db.js";
import { nonces, sessions } from "./schema.js";
import { config } from "./config.js";
import { DomainError } from "../../../packages/shared/src/index.js";
import type { Actor } from "./workflow.js";
const publicKey = z.string().refine((s) => {
  try {
    return bs58.decode(s).length === 32;
  } catch {
    return false;
  }
}, "Invalid Solana public key");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const message = (wallet: string, nonce: string) =>
  `ProofCommerce wallet login\nOrigin: ${config.CORS_ORIGIN}\nWallet: ${wallet}\nNonce: ${nonce}`;
export const auth = Router();
auth.post("/nonce", async (req, res) => {
  const { wallet } = z.object({ wallet: publicKey }).strict().parse(req.body);
  const nonce = randomBytes(32).toString("hex");
  await db
    .insert(nonces)
    .values({ nonce, wallet, expires: new Date(Date.now() + 300000) });
  res.json({ nonce, message: message(wallet, nonce) });
});
auth.post("/verify", async (req, res) => {
  const body = z
    .object({
      wallet: publicKey,
      nonce: z.string().length(64),
      signature: z.string().max(128),
    })
    .strict()
    .parse(req.body);
  const token = await db.transaction(async (tx) => {
    const [n] = await tx
      .select()
      .from(nonces)
      .where(eq(nonces.nonce, body.nonce))
      .for("update");
    let valid = false;
    try {
      valid = nacl.sign.detached.verify(
        Buffer.from(message(body.wallet, body.nonce)),
        bs58.decode(body.signature),
        bs58.decode(body.wallet),
      );
    } catch {
      /* Invalid encoding is authentication failure. */
    }
    if (
      !n ||
      n.wallet !== body.wallet ||
      n.expires.getTime() < Date.now() ||
      !valid
    )
      throw new DomainError(
        "INVALID_SIGNATURE",
        "Invalid or expired wallet challenge",
        401,
      );
    await tx.delete(nonces).where(eq(nonces.nonce, body.nonce));
    const token = randomBytes(32).toString("hex");
    await tx
      .insert(sessions)
      .values({
        tokenHash: tokenHash(token),
        wallet: body.wallet,
        expires: new Date(Date.now() + 3600000),
      });
    return token;
  });
  res.json({ token, expiresIn: 3600 });
});
export async function actor(req: Request): Promise<Actor> {
  if (config.demo && req.headers["x-proofcommerce-demo"] === "true")
    return { wallet: "local-demo", demo: true };
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token)
    throw new DomainError(
      "UNAUTHORIZED",
      "Sign a wallet challenge to continue",
      401,
    );
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash(token)),
        gt(sessions.expires, new Date()),
      ),
    );
  if (!session) throw new DomainError("UNAUTHORIZED", "Session expired", 401);
  return { wallet: session.wallet, demo: false };
}
export { publicKey };
