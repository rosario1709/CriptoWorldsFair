"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Terminal,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { WalletLogin } from "./wallet-login";
import type {
  Agreement,
  Agent,
  Service,
  Event,
  Reputation,
} from "../../../packages/shared/src/index";
import "./console.css";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Health = {
  status: string;
  chainReady: boolean;
  network: string;
  demo: boolean;
  mint: string | null;
  programId: string | null;
};
type Data = {
  health: Health | null;
  agents: Agent[];
  services: Service[];
  agreements: Agreement[];
};
const empty: Data = { health: null, agents: [], services: [], agreements: [] };
async function request<T>(
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  const token = sessionStorage.getItem("pc-session");
  const response = await fetch(`${API}${path}`, {
    ...(body === undefined
      ? {}
      : { method: "POST", body: JSON.stringify(body) }),
    headers: {
      "Content-Type": "application/json",
      "X-Proofcommerce-Demo": "true",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    signal: AbortSignal.timeout(120000),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error?.message ?? "API request failed");
  return value;
}
const short = (s?: string) =>
  s ? `${s.slice(0, 6)}…${s.slice(-5)}` : "Not configured";
const money = (n: number) => n.toFixed(2);
const iconFor = (category: string) =>
  category === "weather" ? (
    <Globe size={23} />
  ) : category === "translation" ? (
    <Code2 size={23} />
  ) : (
    <Sparkles size={23} />
  );
function Badge({ status }: { status: string }) {
  return (
    <span
      className={`status ${["SETTLED", "VERIFIED", "PASS"].includes(status) ? "success" : ["REJECTED", "FAIL"].includes(status) ? "failure" : ""}`}
    >
      <span />
      {status.replaceAll("_", " ")}
    </span>
  );
}
function TxLink({
  signature,
  network,
}: {
  signature?: string;
  network?: string;
}) {
  if (!signature) return <span className="muted">Awaiting transaction</span>;
  if (network !== "devnet")
    return <code title={signature}>{short(signature)} · local validator</code>;
  return (
    <a
      className="tx-link"
      href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
      target="_blank"
      rel="noreferrer"
    >
      {short(signature)} <ExternalLink size={12} />
    </a>
  );
}
function Header({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
function AgreementTable({ data, items }: { data: Data; items: Agreement[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>AGREEMENT / SERVICE</th>
            <th>PROVIDER</th>
            <th>AMOUNT</th>
            <th>STATUS</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>
                <Link href={`/agreements/${a.id}`}>
                  <b>
                    {data.services.find((s) => s.id === a.serviceId)?.name ??
                      a.serviceId}
                  </b>
                  <small className="block mono">{short(a.id)}</small>
                </Link>
              </td>
              <td>
                {data.agents.find((p) => p.id === a.providerAgentId)?.name ??
                  a.providerAgentId}
              </td>
              <td className="mono">
                {Number(a.amount).toFixed(6)} <small>pcUSD</small>
              </td>
              <td>
                <Badge status={a.status} />
              </td>
              <td>
                <Link
                  aria-label={`Open agreement ${a.id}`}
                  href={`/agreements/${a.id}`}
                >
                  <ArrowUpRight size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <div className="empty">
          <Box size={30} />
          <h3>Your first agreement starts here.</h3>
          <p>
            Choose a provider, define the requirements, and let proof drive the
            payment.
          </p>
          <Link className="button secondary" href="/marketplace">
            Explore marketplace <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
export default function Console() {
  const path = usePathname(),
    router = useRouter(),
    parts = path.split("/").filter(Boolean);
  const section = parts[0] ?? "dashboard",
    id = parts[1];
  const [data, setData] = useState<Data>(empty),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [events, setEvents] = useState<Event[]>([]),
    [menu, setMenu] = useState(false),
    [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [health, agents, services, agreements] = await Promise.all([
        request<Health>("/health"),
        request<Agent[]>("/agents"),
        request<Service[]>("/services"),
        request<Agreement[]>("/agreements"),
      ]);
      setData({ health, agents, services, agreements });
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "API unavailable");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const source = new EventSource(`${API}/events/stream`);
    let timer: ReturnType<typeof setTimeout>;
    source.onmessage = (e) => {
      const event: Event = JSON.parse(e.data);
      setEvents((previous) =>
        [event, ...previous.filter((x) => x.id !== event.id)].slice(0, 40),
      );
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 200);
    };
    return () => {
      source.close();
      clearTimeout(timer);
    };
  }, [refresh]);
  const operate = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const postAction = async (a: Agreement, action: string) =>
    request<Agreement>(
      `/agreements/${a.id}/${action}`,
      {},
      crypto.randomUUID(),
    );
  const run = async (a: Agreement) =>
    operate(async () => {
      let current = a;
      for (const [status, action] of [
        ["CREATED", "fund"],
        ["FUNDED", "accept"],
        ["ACCEPTED", "execute"],
        ["SUBMITTED", "verify"],
        ["VERIFIED", "settle"],
      ] as const) {
        if (current.status === status) {
          current = await postAction(current, action);
          await refresh();
        }
      }
    });
  const hire = (
    service: Service,
    requirements: { city: string; country: string; days: number },
  ) =>
    operate(async () => {
      const a = await request<Agreement>(
        "/agreements",
        {
          buyerAgentId: "buyer",
          service: service.slug,
          requirements,
          maxPrice: service.price,
        },
        crypto.randomUUID(),
      );
      router.push(`/agreements/${a.id}`);
    });
  const settled = data.agreements.filter((a) => a.status === "SETTLED"),
    protectedAgreements = data.agreements.filter(
      (a) =>
        !["CREATED", "SETTLED", "REFUNDED", "CANCELLED"].includes(a.status),
    );
  const total = settled.reduce((sum, a) => sum + Number(a.amount), 0),
    protectedTotal = protectedAgreements.reduce(
      (sum, a) => sum + Number(a.amount),
      0,
    ),
    verified = data.agreements.filter((a) => a.verification),
    passed = verified.filter((a) => a.verification?.status === "PASS");
  const agreement = data.agreements.find((a) => a.id === id),
    service = data.services.find((s) => s.slug === id),
    agent = data.agents.find((a) => a.id === id);
  const nav = [
    ["dashboard", "Overview", LayoutDashboard],
    ["marketplace", "Marketplace", Globe],
    ["agreements", "Agreements", Box],
    ["agents", "Agents", Wallet],
  ] as const;
  return (
    <div className="console">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-symbol">▧</span>ProofCommerce
          <span className="beta">β</span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">PC</span>
          <div>
            Development workspace<small>Personal organization</small>
          </div>
          <ChevronRight size={13} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={`/${href}`}
              className={section === href ? "selected" : ""}
              onClick={() => setMenu(false)}
            >
              <Icon size={17} />
              {label}
              {href === "agreements" && data.agreements.length > 0 && (
                <span className="nav-count">{data.agreements.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="protocol-card">
            <ShieldCheck size={20} />
            <strong>Proof before payment.</strong>
            <p>Every settlement starts with a verified delivery.</p>
            <Link href="/marketplace">
              Explore the protocol <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="network">
            <span className={data.health?.chainReady ? "dot" : "dot amber"} />
            <div>
              Solana {data.health?.network ?? "unavailable"}
              <small>
                {data.health?.chainReady
                  ? "Escrow program connected"
                  : "Escrow setup required"}
              </small>
            </div>
          </div>
          <small className="version">ProofCommerce v0.1 · MVP</small>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="row">
            <button
              className="mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <span className="muted">Workspace</span>
            <ChevronRight size={13} />
            <span>
              {nav.find((n) => n[0] === section)?.[1] ?? "Service details"}
            </span>
          </div>
          <div className="row">
            {data.health?.demo && <span className="demo-badge">DEMO MODE</span>}
            {!data.health?.demo && <WalletLogin />}
            <span className="avatar">PC</span>
          </div>
        </header>
        <main className="console-content">
          {error && (
            <div role="alert" className="error" style={{ marginBottom: 20 }}>
              {error}
              <button
                className="dismiss"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}
          {loaded && !data.health?.chainReady && (
            <div className="setup-banner">
              <Terminal size={16} />
              <span>
                Solana escrow is not connected. Browsing is available; payments
                require a deployed program and test mint.
              </span>
            </div>
          )}
          {section === "dashboard" && (
            <>
              <Header
                eyebrow="YOUR COMMERCE CONTROL PLANE"
                title="Overview"
                description="Autonomous transactions. Verifiable outcomes."
                action={
                  <Link href="/marketplace" className="button">
                    <Plus size={15} /> New agreement
                  </Link>
                }
              />
              <div className="metrics">
                {[
                  [
                    ArrowUpRight,
                    "Total settled",
                    `${money(total)} pcUSD`,
                    "Confirmed on-chain payments",
                  ],
                  [
                    ShieldCheck,
                    "Protected volume",
                    `${money(protectedTotal)} pcUSD`,
                    "Currently held in escrow",
                  ],
                  [
                    Box,
                    "Active agreements",
                    String(protectedAgreements.length),
                    "In the delivery pipeline",
                  ],
                  [
                    Activity,
                    "Verification success",
                    verified.length
                      ? `${Math.round((passed.length / verified.length) * 100)}%`
                      : "—",
                    `${verified.length} verified deliveries`,
                  ],
                ].map(([Icon, label, value, sub]) => {
                  const I = Icon as typeof Box;
                  return (
                    <div className="metric" key={String(label)}>
                      <div className="row">
                        <span>{String(label)}</span>
                        <I size={17} />
                      </div>
                      <strong>{String(value)}</strong>
                      <small>{String(sub)}</small>
                    </div>
                  );
                })}
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Settlement activity</h2>
                      <small>Verified value transferred · pcUSD</small>
                    </div>
                    <span className="period">Last 7 days</span>
                  </div>
                  <div className="chart">
                    <div className="chart-labels">
                      <span>SETTLED VOLUME</span>
                      <b>
                        {money(total)} <small>pcUSD</small>
                      </b>
                    </div>
                    <div className="bars">
                      {Array.from({ length: 7 }, (_, i) => {
                        const d = new Date(Date.now() - (6 - i) * 86400000),
                          day = d.toISOString().slice(0, 10),
                          v = settled
                            .filter((a) => a.updatedAt.startsWith(day))
                            .reduce((s, a) => s + Number(a.amount), 0);
                        return (
                          <div key={day} className="bar-column">
                            <div className="bar-track">
                              <div
                                className="bar"
                                style={{
                                  height: `${v ? Math.max(5, (v / Math.max(total, 0.01)) * 100) : 0}%`,
                                }}
                                title={`${day}: ${v} pcUSD`}
                              />
                            </div>
                            <small>
                              {d.toLocaleDateString("en", { weekday: "short" })}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                    {!settled.length && (
                      <span className="chart-empty">
                        Your confirmed settlements will appear here
                      </span>
                    )}
                  </div>
                  <div className="chart-footer">
                    <span className="legend-dot" /> On-chain settlements{" "}
                    <span className="muted">No synthetic activity</span>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Live activity</h2>
                    <span className="live-label">
                      <span className="dot" /> LIVE
                    </span>
                  </div>
                  <div className="activity-list">
                    {events.slice(0, 5).map((e) => (
                      <Link
                        key={e.id}
                        href={`/agreements/${e.agreementId}`}
                        className="activity-item"
                      >
                        <div className="event-icon">
                          <Activity size={15} />
                        </div>
                        <div>
                          <b>{e.type.replaceAll(".", " ")}</b>
                          <small>{short(e.agreementId)}</small>
                        </div>
                        <time>
                          {new Date(e.at).toLocaleTimeString("en", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </Link>
                    ))}
                    {!events.length && (
                      <div className="empty compact">
                        <Activity size={26} />
                        <p>Listening for agreement events</p>
                        <small>Live updates appear as agents work.</small>
                      </div>
                    )}
                  </div>
                  <div className="panel-foot">
                    Durable event stream <Zap size={13} />
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Recent agreements</h2>
                  <Link href="/agreements" className="text-link">
                    View all <ArrowRight size={14} />
                  </Link>
                </div>
                <AgreementTable
                  data={data}
                  items={data.agreements.slice(0, 5)}
                />
              </section>
              <div className="bottom-note">
                <ShieldCheck size={15} /> Escrow balances are controlled by the
                Solana program.<span>pcUSD — Test Stablecoin</span>
              </div>
            </>
          )}
          {section === "marketplace" && (
            <>
              <Header
                eyebrow="DISCOVER · AGREE · VERIFY"
                title="Agent marketplace"
                description="Hire a service. Define success. Only pay for verified delivery."
              />
              <div className="market-toolbar">
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search services"
                    placeholder="Search services or providers…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="filters">
                  {["all", "weather", "translation", "vision"].map((c) => (
                    <button
                      key={c}
                      className={category === c ? "active" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c === "all"
                        ? "All services"
                        : c[0].toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="service-grid">
                {data.services
                  .filter(
                    (s) =>
                      (category === "all" || s.category === category) &&
                      `${s.name} ${s.providerId}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((s) => (
                    <article className="service-card" key={s.id}>
                      <div className="row">
                        <div
                          className={`service-icon ${s.providerId === "malicious" ? "malicious" : ""}`}
                        >
                          {iconFor(s.category)}
                        </div>
                        <span className="category">
                          {s.active ? "DEMO SERVICE" : "ROADMAP"}
                        </span>
                      </div>
                      <h2>{s.name}</h2>
                      <p className="muted">{s.description}</p>
                      <div className="provider-line">
                        <span className="mini-avatar">
                          {s.providerId === "malicious" ? "M" : "W"}
                        </span>
                        {data.agents.find((a) => a.id === s.providerId)?.name}
                        <ShieldCheck size={14} />
                      </div>
                      <div className="service-facts">
                        <div>
                          <small>Completed</small>
                          <b>
                            {
                              data.agreements.filter(
                                (a) =>
                                  a.serviceId === s.id &&
                                  a.status === "SETTLED",
                              ).length
                            }{" "}
                            jobs
                          </b>
                        </div>
                        <div>
                          <small>Verification</small>
                          <b>Deterministic</b>
                        </div>
                        <div>
                          <small>Latency</small>
                          <b>
                            {data.agreements.some(
                              (a) =>
                                a.serviceId === s.id && a.status === "SETTLED",
                            )
                              ? `${Math.round(data.agreements.filter((a) => a.serviceId === s.id && a.status === "SETTLED").reduce((v, a) => v + Date.parse(a.updatedAt) - Date.parse(a.createdAt), 0) / data.agreements.filter((a) => a.serviceId === s.id && a.status === "SETTLED").length)} ms`
                              : "Not measured"}
                          </b>
                        </div>
                      </div>
                      <div className="service-footer">
                        <div>
                          <b>{s.price}</b>
                          <small> pcUSD / request</small>
                        </div>
                        <Link
                          href={`/services/${s.slug}`}
                          className="button secondary"
                        >
                          View service <ArrowUpRight size={13} />
                        </Link>
                      </div>
                    </article>
                  ))}
              </div>
              <p className="disclosure">
                Demo Data · Weather output is a deterministic fixture.
                Translation and image analysis are roadmap entries.
              </p>
            </>
          )}
          {section === "services" && service && (
            <ServiceDetail
              service={service}
              data={data}
              busy={busy}
              hire={hire}
            />
          )}
          {section === "agreements" && !id && (
            <>
              <Header
                eyebrow="AUDITABLE COMMERCE"
                title="Agreements"
                description="Follow every request from intent to settlement."
                action={
                  <Link className="button" href="/marketplace">
                    <Plus size={15} /> New agreement
                  </Link>
                }
              />
              <section className="panel">
                <AgreementTable data={data} items={data.agreements} />
              </section>
            </>
          )}
          {section === "agreements" && id && agreement && (
            <AgreementDetail
              agreement={agreement}
              data={data}
              events={events}
              busy={busy}
              run={() => void run(agreement)}
              action={(action) =>
                void operate(async () => {
                  await postAction(agreement, action);
                })
              }
            />
          )}
          {section === "agents" && id !== "new" && (
            <>
              <Header
                eyebrow="IDENTITY & REPUTATION"
                title={agent?.name ?? "Your agents"}
                description="Independent identities, explicit budgets, earned reputation."
                action={
                  <Link href="/agents/new" className="button">
                    <Plus size={15} /> Create agent
                  </Link>
                }
              />
              <div className="service-grid">
                {(agent ? [agent] : data.agents).map((a) => (
                  <AgentCard key={a.id} agent={a} />
                ))}
              </div>
              {agent && (
                <section className="panel" style={{ marginTop: 24 }}>
                  <div className="panel-heading">
                    <h2>Agreement history</h2>
                  </div>
                  <AgreementTable
                    data={data}
                    items={data.agreements.filter(
                      (a) =>
                        a.buyerAgentId === agent.id ||
                        a.providerAgentId === agent.id,
                    )}
                  />
                </section>
              )}
            </>
          )}
          {section === "agents" && id === "new" && (
            <>
              <Header
                eyebrow="REGISTER AN IDENTITY"
                title="Create an agent"
                description="Keep spending authority explicit and secrets out of the browser."
              />
              <AgentForm
                mint={data.health?.mint ?? ""}
                demo={data.health?.demo ?? false}
                busy={busy}
                submit={(body) =>
                  operate(async () => {
                    const a = await request<Agent>("/agents", body);
                    router.push(`/agents/${a.id}`);
                  })
                }
              />
            </>
          )}
          {loaded &&
            ((section === "services" && !service) ||
              (section === "agreements" && id && !agreement)) && (
              <div className="empty">
                <h2>Resource not found</h2>
                <Link href="/dashboard">Return to overview</Link>
              </div>
            )}
          {!loaded && !error && (
            <div className="empty">Connecting to ProofCommerce…</div>
          )}
        </main>
        <footer className="console-footer">
          <span>ProofCommerce · Verified settlement infrastructure</span>
          <span>
            <span className="dot" />{" "}
            {data.health ? "API connected" : "API unavailable"}
          </span>
        </footer>
      </div>
    </div>
  );
}
function ServiceDetail({
  service: s,
  data,
  busy,
  hire,
}: {
  service: Service;
  data: Data;
  busy: boolean;
  hire: (
    s: Service,
    r: { city: string; country: string; days: number },
  ) => void;
}) {
  const [city, setCity] = useState("Lima"),
    [country, setCountry] = useState("PE"),
    [days, setDays] = useState(7);
  return (
    <>
      <Header
        eyebrow="MARKETPLACE / SERVICE"
        title={s.name}
        description={s.description}
      />
      <div className="detail-grid">
        <section className="panel detail-panel">
          <div className="service-icon">{iconFor(s.category)}</div>
          <h2 style={{ marginTop: 24 }}>Delivery contract</h2>
          <p className="muted">
            Structured JSON containing the requested city, country, and
            consecutive forecast days. Evidence must match its on-chain SHA-256
            commitment.
          </p>
          <ul className="rules">
            {[
              "Required JSON fields and temperature bounds",
              "Exact city and country match",
              "Exact number of requested days",
              "Fresh timestamp and consecutive dates",
              "Canonical payload matches on-chain hash",
            ].map((r) => (
              <li key={r}>
                <Check size={15} />
                {r}
              </li>
            ))}
          </ul>
          <p>
            <small>Provider</small>
            <br />
            {data.agents.find((a) => a.id === s.providerId)?.name}
          </p>
          <div className="info-note">
            Verification proves delivery requirements, not weather accuracy.
            This provider returns a labeled local fixture.
          </div>
        </section>
        <form
          className="panel detail-panel"
          onSubmit={(e) => {
            e.preventDefault();
            hire(s, { city, country, days });
          }}
        >
          <small>PRICE PER VERIFIED DELIVERY</small>
          <div className="price">
            {s.price}
            <small> pcUSD</small>
          </div>
          <label>
            City
            <input
              required
              maxLength={100}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
          <label>
            Country code
            <input
              required
              pattern="[A-Z]{2}"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
            />
          </label>
          <label>
            Forecast days
            <input
              type="number"
              min={1}
              max={14}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <Button disabled={busy || !s.active} style={{ width: "100%" }}>
            <ShieldCheck size={16} />
            {s.active ? "Hire Agent" : "Service on roadmap"}
          </Button>
          <p className="disclosure">
            pcUSD — Test Stablecoin
            <br />
            Your agent&apos;s spending policy is checked before creation.
          </p>
        </form>
      </div>
    </>
  );
}
function AgreementDetail({
  agreement: a,
  data,
  events,
  busy,
  run,
  action,
}: {
  agreement: Agreement;
  data: Data;
  events: Event[];
  busy: boolean;
  run: () => void;
  action: (s: string) => void;
}) {
  const [history, setHistory] = useState<Event[]>([]),
    [evidenceOpen, setEvidenceOpen] = useState(false);
  useEffect(() => {
    void request<Event[]>(`/agreements/${a.id}/events`).then(setHistory);
  }, [a.id, a.updatedAt, events]);
  const failed = a.verification?.status === "FAIL",
    settled = a.status === "SETTLED",
    refunded = a.status === "REFUNDED";
  const next: Record<string, string> = {
    CREATED: "Fund escrow",
    FUNDED: "Accept delivery contract",
    ACCEPTED: "Execute provider",
    SUBMITTED: "Verify evidence",
    VERIFIED: "Release payment",
  };
  return (
    <>
      <Header
        eyebrow={`AGREEMENT / ${short(a.id)}`}
        title={`${a.requirements.days}-day forecast for ${a.requirements.city}`}
        description={`${data.agents.find((p) => p.id === a.buyerAgentId)?.name ?? a.buyerAgentId} → ${data.agents.find((p) => p.id === a.providerAgentId)?.name ?? a.providerAgentId}`}
        action={<Badge status={a.status} />}
      />
      <div className={`settlement-strip ${failed ? "rejected" : ""}`}>
        <div>
          <Wallet size={20} />
          <strong>
            {Number(a.amount).toFixed(6)} <small>pcUSD</small>
          </strong>
          <span>
            {settled
              ? "ESCROW SETTLED"
              : refunded
                ? "RETURNED TO BUYER"
                : a.status === "CREATED"
                  ? "AWAITING FUNDING"
                  : "LOCKED IN ESCROW"}
          </span>
        </div>
        <ArrowRight className="strip-arrow" />
        <div>
          {failed ? <ShieldX size={22} /> : <ShieldCheck size={22} />}
          <strong>
            {failed
              ? "Delivery rejected"
              : a.verification
                ? "Delivery verified"
                : "Awaiting delivery"}
          </strong>
          <span>
            {failed
              ? "REQUIREMENTS NOT MET"
              : a.verification
                ? "DETERMINISTIC CHECKS PASSED"
                : "EVIDENCE REQUIRED"}
          </span>
        </div>
        <ArrowRight className="strip-arrow" />
        <div>
          {settled || refunded ? (
            <Check size={22} />
          ) : (
            <ShieldCheck size={22} />
          )}
          <strong>
            {settled
              ? "Payment released"
              : refunded
                ? "Refund completed"
                : "Payment protected"}
          </strong>
          <span>
            {settled
              ? "CONFIRMED ON-CHAIN"
              : refunded
                ? "CONFIRMED ON-CHAIN"
                : "NOT RELEASED"}
          </span>
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel detail-panel">
          <h2>Agreement timeline</h2>
          <p className="muted">Every action leaves a verifiable trail.</p>
          <div className="timeline">
            {history.map((e, i) => (
              <div className="timeline-item" key={e.id}>
                <span
                  className={`timeline-point ${e.type.includes("failed") ? "failure" : ""}`}
                >
                  {e.type.includes("failed") ? (
                    <ShieldX size={15} />
                  ) : (
                    <Check size={15} />
                  )}
                </span>
                <div>
                  <div className="row">
                    <b>{e.type.replaceAll(".", " ")}</b>
                    <small>{new Date(e.at).toLocaleTimeString()}</small>
                  </div>
                  <small>Actor: {short(e.actor)}</small>
                  {e.transaction && (
                    <div>
                      <TxLink
                        signature={e.transaction}
                        network={data.health?.network}
                      />
                    </div>
                  )}
                  {i === 0 && (
                    <small className="block mono">
                      Correlation: {short(a.correlationId)}
                    </small>
                  )}
                </div>
              </div>
            ))}
          </div>
          {next[a.status] && (
            <Button disabled={busy} onClick={run}>
              <Zap size={15} />
              {busy
                ? "Waiting for confirmation…"
                : `${next[a.status]} & continue`}
            </Button>
          )}
          {a.status === "REJECTED" && (
            <div className="row">
              <Button disabled={busy} onClick={() => action("refund")}>
                <ArrowDownLeft size={15} /> Refund protected funds
              </Button>
              <Button
                variant="secondary"
                disabled={busy || Date.now() > a.deadline * 1000}
                onClick={() => action("execute")}
              >
                Retry provider
              </Button>
            </div>
          )}
          {![
            "CREATED",
            "VERIFIED",
            "SETTLED",
            "REFUNDED",
            "CANCELLED",
            "REJECTED",
          ].includes(a.status) &&
            Date.now() >= a.deadline * 1000 && (
              <Button disabled={busy} onClick={() => action("refund")}>
                Refund expired agreement
              </Button>
            )}
        </section>
        <div>
          <section className="panel detail-panel">
            <h2>Verification report</h2>
            {!a.verification ? (
              <div className="empty compact">
                <ShieldCheck size={28} />
                <p>Waiting for evidence</p>
              </div>
            ) : (
              <>
                <div className={failed ? "bad" : "good"}>
                  {a.verification.reason}
                </div>
                <div className="check-list">
                  {a.verification.checks.map((c) => (
                    <div key={c.name} className="verification-check">
                      <span className={c.status === "PASS" ? "good" : "bad"}>
                        {c.status === "PASS" ? (
                          <Check size={16} />
                        ) : (
                          <ShieldX size={16} />
                        )}
                      </span>
                      <div>
                        <b>{c.name}</b>
                        {c.expected !== undefined && (
                          <small>
                            Expected:{" "}
                            {typeof c.expected === "string"
                              ? c.expected
                              : JSON.stringify(c.expected)}
                            <br />
                            Received:{" "}
                            {typeof c.actual === "string"
                              ? c.actual
                              : JSON.stringify(c.actual)}
                          </small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
          <section className="panel detail-panel" style={{ marginTop: 20 }}>
            <h2>Proof of delivery</h2>
            <small>EVIDENCE HASH · SHA-256</small>
            <p className="hash">
              {a.evidence?.contentHash ?? "No evidence submitted"}
            </p>
            {a.verification?.checks.find(
              (c) => c.name === "On-chain commitment",
            )?.status === "PASS" && (
              <p className="good proof-label">
                <ShieldCheck size={14} />
                Verified against on-chain commitment
              </p>
            )}
            {a.evidence && (
              <Button
                variant="secondary"
                onClick={() => setEvidenceOpen(!evidenceOpen)}
              >
                View Evidence
              </Button>
            )}
            {evidenceOpen && (
              <pre>{JSON.stringify(a.evidence?.payload, null, 2)}</pre>
            )}
            <hr />
            <dl className="terms">
              <dt>Requirements</dt>
              <dd>
                {a.requirements.city}, {a.requirements.country} ·{" "}
                {a.requirements.days} days
              </dd>
              <dt>Network</dt>
              <dd>Solana {data.health?.network}</dd>
              <dt>Escrow PDA</dt>
              <dd title={a.escrowAddress}>{short(a.escrowAddress)}</dd>
              <dt>Deadline</dt>
              <dd>{new Date(a.deadline * 1000).toLocaleString()}</dd>
              <dt>Payment</dt>
              <dd>
                <TxLink
                  signature={
                    a.transactions.settle ??
                    a.transactions.refund ??
                    a.transactions.fund
                  }
                  network={data.health?.network}
                />
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
function AgentCard({ agent: a }: { agent: Agent }) {
  const [rep, setRep] = useState<Reputation | null>(null);
  useEffect(() => {
    void request<Reputation>(`/reputation/${a.id}`).then(setRep);
  }, [a.id]);
  return (
    <article className="service-card">
      <div className="row">
        <div className="service-icon">
          <Wallet size={22} />
        </div>
        <span className="category">{a.type}</span>
      </div>
      <h2>
        <Link href={`/agents/${a.id}`}>{a.name}</Link>
      </h2>
      <div className="row mono muted">
        <span title={a.publicKey}>{short(a.publicKey)}</span>
        <button
          className="icon-button"
          aria-label="Copy public key"
          onClick={() => void navigator.clipboard.writeText(a.publicKey)}
        >
          <Copy size={14} />
        </button>
      </div>
      <div className="service-facts">
        <div>
          <small>Completed</small>
          <b>{rep?.jobsCompleted ?? 0}</b>
        </div>
        <div>
          <small>Success</small>
          <b>
            {rep?.jobsCompleted ? `${Math.round(rep.successRate * 100)}%` : "—"}
          </b>
        </div>
        <div>
          <small>Score</small>
          <b>{rep?.jobsCompleted ? rep.score : "Unrated"}</b>
        </div>
      </div>
      <dl className="terms">
        <dt>Settled volume</dt>
        <dd>
          {rep ? (Number(rep.totalVolume) / 1e6).toFixed(6) : "0.000000"} pcUSD
        </dd>
        <dt>Rejected jobs</dt>
        <dd>{rep?.jobsFailed ?? 0}</dd>
        <dt>Max transaction</dt>
        <dd>{a.policy.maxPerTransaction} pcUSD</dd>
        <dt>Daily budget</dt>
        <dd>{a.policy.dailyBudget} pcUSD</dd>
      </dl>
      <small>
        {a.demo
          ? "Demo identity · activity is measured"
          : "Wallet-verified identity"}
      </small>
    </article>
  );
}
function AgentForm({
  mint,
  demo,
  busy,
  submit,
}: {
  mint: string;
  demo: boolean;
  busy: boolean;
  submit: (body: unknown) => void;
}) {
  const [mode, setMode] = useState(demo ? "development" : "external");
  return (
    <form
      className="panel detail-panel"
      style={{ maxWidth: 650 }}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        submit({
          name: form.get("name"),
          type: form.get("type"),
          ...(mode === "external" ? { publicKey: form.get("wallet") } : {}),
          policy: {
            maxPerTransaction: form.get("max"),
            dailyBudget: form.get("budget"),
            allowedServices: String(form.get("categories"))
              .split(",")
              .map((s) => s.trim()),
            allowedProviders: ["provider", "malicious"],
            allowedMints: mint ? [mint] : [],
          },
        });
      }}
    >
      <label>
        Name
        <input name="name" required placeholder="ResearchAgent" />
      </label>
      <label>
        Agent type
        <select name="type">
          <option>BUYER</option>
          <option>PROVIDER</option>
          <option>BOTH</option>
        </select>
      </label>
      <label>
        Signing interface
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {demo && (
            <option value="development">Create development wallet</option>
          )}
          <option value="external">External wallet public key</option>
        </select>
      </label>
      {mode === "external" && (
        <label>
          Wallet public key
          <input name="wallet" required />
        </label>
      )}
      <div className="info-note">
        Development keys are stored only on the server. New agents need a
        configured transaction signer and a funded token account before
        purchasing.
      </div>
      <div className="grid3" style={{ marginTop: 20 }}>
        <label>
          Max transaction
          <input
            name="max"
            defaultValue="1.00"
            required
            pattern="[0-9]+(\.[0-9]{1,6})?"
          />
        </label>
        <label>
          Daily budget
          <input
            name="budget"
            defaultValue="10.00"
            required
            pattern="[0-9]+(\.[0-9]{1,6})?"
          />
        </label>
        <label>
          Allowed categories
          <input name="categories" defaultValue="weather" />
        </label>
      </div>
      <Button disabled={busy}>
        <Plus size={15} /> Create agent
      </Button>
    </form>
  );
}
