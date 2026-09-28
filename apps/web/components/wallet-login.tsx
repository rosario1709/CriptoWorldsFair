"use client";
import { useState } from "react";
import bs58 from "bs58";
import { Button } from "./ui/button";
interface WalletProvider {
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(
    message: Uint8Array,
    encoding: "utf8",
  ): Promise<{ signature: Uint8Array }>;
}
export function WalletLogin() {
  const [wallet, setWallet] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const login = async () => {
    setBusy(true);
    setError("");
    try {
      const provider = (window as Window & { solana?: WalletProvider }).solana;
      if (!provider)
        throw new Error(
          "Open a Solana wallet extension that supports signMessage.",
        );
      const { publicKey } = await provider.connect(),
        address = publicKey.toString();
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      const challenge = await fetch(`${base}/auth/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      }).then((r) => r.json());
      if (!challenge.message) throw new Error("Wallet challenge unavailable");
      const signed = await provider.signMessage(
        new TextEncoder().encode(challenge.message),
        "utf8",
      );
      const response = await fetch(`${base}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          nonce: challenge.nonce,
          signature: bs58.encode(signed.signature),
        }),
      });
      const session = await response.json();
      if (!response.ok)
        throw new Error(session.error?.message ?? "Signature not accepted");
      sessionStorage.setItem("pc-session", session.token);
      setWallet(address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Button variant="secondary" disabled={busy} onClick={() => void login()}>
        {wallet
          ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}`
          : "Connect wallet"}
      </Button>
      {error && (
        <p
          role="alert"
          className="bad"
          style={{ fontSize: 10, maxWidth: 250, margin: "6px 0" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
