import Link from "next/link";
export default function Home() {
  return (
    <main className="shell">
      <header className="row">
        <b>▧ ProofCommerce</b>
        <Link className="button secondary" href="/dashboard">
          Open console →
        </Link>
      </header>
      <section style={{ padding: "110px 0 80px", maxWidth: 800 }}>
        <span className="pill">BUILT ON SOLANA · VERIFIED SETTLEMENT</span>
        <h1
          style={{
            fontSize: "clamp(40px,7vw,76px)",
            lineHeight: 1.05,
            margin: "28px 0",
          }}
        >
          Trust infrastructure for autonomous commerce.
        </h1>
        <p className="muted" style={{ fontSize: 21 }}>
          AI agents can spend money. ProofCommerce makes sure they only pay when
          the job is actually done.
        </p>
        <Link href="/marketplace" className="button">
          Try Live Demo →
        </Link>
        {process.env.NEXT_PUBLIC_GITHUB_URL && (
          <a
            className="button secondary"
            href={process.env.NEXT_PUBLIC_GITHUB_URL}
          >
            View GitHub
          </a>
        )}
      </section>
      <div className="grid3">
        <article className="card">
          <small>01 / THE PROBLEM</small>
          <h2 style={{ marginTop: 20 }}>Payment isn’t proof.</h2>
          <p className="muted">
            Payments tell us money moved. They don&apos;t tell us whether the
            work was delivered.
          </p>
        </article>
        <article className="card">
          <small>02 / THE PROTOCOL</small>
          <h2 style={{ marginTop: 20 }}>Delivery before settlement.</h2>
          <p className="muted">
            Discover → Agree → Escrow → Execute → Verify → Settle.
          </p>
        </article>
        <article className="card">
          <small>03 / THE PRIMITIVE</small>
          <h2 style={{ marginTop: 20 }}>Programmable trust.</h2>
          <p className="muted">
            SPL token escrow, committed evidence, deterministic checks and an
            auditable payment trail.
          </p>
        </article>
      </div>
      <section className="card" style={{ marginTop: 30 }}>
        <small>BUILT FOR DEVELOPERS</small>
        <pre>
          {
            'const result = await proofcommerce.buy({\n  service: "weather-7d",\n  requirements: { city: "Lima", country: "PE", days: 7 },\n  maxPrice: "0.05"\n});'
          }
        </pre>
        <p className="muted">
          APIs · Data · Compute · Inference · Storage · Digital services
        </p>
        <div className="mono good">
          Buyer → SDK → Agreement API → Solana escrow → Provider → Evidence →
          Verifier → Settlement
        </div>
      </section>
      <footer style={{ padding: "40px 0" }} className="muted">
        ProofCommerce / pcUSD — Test Stablecoin / No protocol fees in this MVP.
      </footer>
    </main>
  );
}
