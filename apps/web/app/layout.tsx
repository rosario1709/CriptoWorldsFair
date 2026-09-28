import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ProofCommerce — Verified agent commerce",
  description: "Trust & settlement infrastructure for autonomous AI agents.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
