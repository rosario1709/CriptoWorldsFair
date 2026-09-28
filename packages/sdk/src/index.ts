import type {
  Agreement,
  Service,
  Reputation,
  Requirements,
} from "../../shared/src/index.js";
export interface SessionSigner {
  getPublicKey(): string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}
export interface SDKOptions {
  baseUrl: string;
  network: "localnet" | "devnet";
  demo?: boolean;
  token?: string;
  signer?: SessionSigner;
}
/** Session signatures authorize API calls. Transaction signing is delegated to the configured server-side AgentSigner. */
export class ProofCommerce {
  private token?: string;
  constructor(private options: SDKOptions) {
    this.token = options.token;
  }
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
  ): Promise<T> {
    const response = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.options.demo ? { "X-Proofcommerce-Demo": "true" } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        `${result.error?.code ?? response.status}: ${result.error?.message ?? "Request failed"}`,
      );
    return result as T;
  }
  async login() {
    if (!this.options.signer) throw new Error("SessionSigner is required");
    const signer = this.options.signer;
    const challenge = await this.request<{ nonce: string; message: string }>(
      "/auth/nonce",
      "POST",
      { wallet: signer.getPublicKey() },
    );
    const { default: bs58 } = await import("bs58");
    const signature = bs58.encode(
      await signer.signMessage(new TextEncoder().encode(challenge.message)),
    );
    const session = await this.request<{ token: string }>(
      "/auth/verify",
      "POST",
      { wallet: signer.getPublicKey(), nonce: challenge.nonce, signature },
    );
    this.token = session.token;
  }
  services = {
    list: () => this.request<Service[]>("/services"),
    get: (id: string) =>
      this.request<Service>(`/services/${encodeURIComponent(id)}`),
  };
  agreements = {
    create: (
      input: {
        buyerAgentId: string;
        service: string;
        requirements: Requirements;
        maxPrice: string;
        deadlineSeconds?: number;
      },
      key: string = crypto.randomUUID(),
    ) => this.request<Agreement>("/agreements", "POST", input, key),
    get: (id: string) =>
      this.request<Agreement>(`/agreements/${encodeURIComponent(id)}`),
    cancel: (id: string, key: string = crypto.randomUUID()) =>
      this.action(id, "cancel", key),
  };
  reputation = {
    get: (id: string) =>
      this.request<Reputation>(`/reputation/${encodeURIComponent(id)}`),
  };
  action(
    id: string,
    action:
      | "fund"
      | "accept"
      | "execute"
      | "verify"
      | "settle"
      | "refund"
      | "cancel",
    key: string = crypto.randomUUID(),
  ) {
    return this.request<Agreement>(
      `/agreements/${encodeURIComponent(id)}/${action}`,
      "POST",
      {},
      key,
    );
  }
  verify(id: string, key: string = crypto.randomUUID()) {
    return this.action(id, "verify", key);
  }
  async buy(input: {
    service: string;
    requirements: Requirements;
    maxPrice: string;
    buyerAgentId?: string;
    idempotencyKey?: string;
    onProgress?: (a: Agreement) => void;
  }) {
    if (this.options.signer && !this.token) await this.login();
    const health = await this.request<{ network: string }>("/health");
    if (health.network !== this.options.network)
      throw new Error("API network differs from requested SDK network");
    const key = input.idempotencyKey ?? crypto.randomUUID();
    const request = {
      buyerAgentId: input.buyerAgentId ?? "buyer",
      service: input.service,
      requirements: input.requirements,
      maxPrice: input.maxPrice,
    };
    let a = await this.agreements.create(request, `${key}:create`);
    a = await this.agreements.get(a.id);
    input.onProgress?.(a);
    for (const [status, action] of [
      ["CREATED", "fund"],
      ["FUNDED", "accept"],
      ["ACCEPTED", "execute"],
      ["SUBMITTED", "verify"],
      ["VERIFIED", "settle"],
    ] as const) {
      if (a.status === status) {
        a = await this.action(a.id, action, `${key}:${action}`);
        input.onProgress?.(a);
      }
    }
    return {
      agreementId: a.id,
      status: a.status,
      verification: a.verification,
      transaction: a.transactions.settle,
      agreement: a,
    };
  }
}
