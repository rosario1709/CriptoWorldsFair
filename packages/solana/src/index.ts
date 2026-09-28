/** web3.js v1 is isolated here for Anchor 0.32 ABI compatibility. Browser code never imports this package. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  type AccountMeta,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import { units, DomainError, type Agreement } from "../../shared/src/index.js";
export { Keypair, PublicKey, Connection } from "@solana/web3.js";
export interface AgentSigner {
  getPublicKey(): string;
  signTransaction(transaction: Transaction): Promise<Transaction>;
}
export class DevelopmentSigner implements AgentSigner {
  constructor(private keypair: Keypair) {}
  getPublicKey() {
    return this.keypair.publicKey.toBase58();
  }
  async signTransaction(transaction: Transaction) {
    transaction.partialSign(this.keypair);
    return transaction;
  }
  static async fromFile(path: string) {
    return new DevelopmentSigner(
      Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(await readFile(path, "utf8"))),
      ),
    );
  }
}
export type ChainAction =
  | "initialize"
  | "fund"
  | "accept"
  | "submit"
  | "approve"
  | "settle"
  | "refund"
  | "cancel";
export interface ChainState {
  state: string;
  hash: string;
  requirementsHash: string;
  amount: bigint;
  buyer: string;
  provider: string;
  mint: string;
  verifier: string;
  deadline: number;
}
export interface EscrowGateway {
  address(a: Agreement): string;
  state(a: Agreement): Promise<ChainState | null>;
  execute(
    action: ChainAction,
    a: Agreement,
    approved?: boolean,
  ): Promise<string>;
  health(): Promise<boolean>;
}
const ixNames: Record<ChainAction, string> = {
  initialize: "initialize_agreement",
  fund: "fund_agreement",
  accept: "accept_agreement",
  submit: "submit_delivery_hash",
  approve: "approve_delivery",
  settle: "release_payment",
  refund: "refund",
  cancel: "cancel_expired",
};
const states = [
  "CREATED",
  "FUNDED",
  "ACCEPTED",
  "SUBMITTED",
  "VERIFIED",
  "REJECTED",
  "SETTLED",
  "REFUNDED",
  "CANCELLED",
];
export const discriminator = (name: string) =>
  createHash("sha256").update(name).digest().subarray(0, 8);
const idBytes = (id: string) => createHash("sha256").update(id).digest();
const meta = (
  key: PublicKey,
  signer = false,
  writable = false,
): AccountMeta => ({ pubkey: key, isSigner: signer, isWritable: writable });
export class SolanaEscrow implements EscrowGateway {
  readonly connection: Connection;
  readonly programId: PublicKey;
  constructor(
    rpc: string,
    programId: string,
    private signers: {
      buyer: AgentSigner;
      provider: AgentSigner;
      verifier: AgentSigner;
    },
  ) {
    this.connection = new Connection(rpc, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 45000,
      fetch: async (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    });
    this.programId = new PublicKey(programId);
  }
  address(a: Agreement) {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("agreement"),
        idBytes(a.id),
        new PublicKey(a.buyerWallet).toBuffer(),
        new PublicKey(a.providerWallet).toBuffer(),
        new PublicKey(a.mint).toBuffer(),
      ],
      this.programId,
    )[0].toBase58();
  }
  async health() {
    try {
      const info = await this.connection.getAccountInfo(this.programId);

      if (!info) {
        console.error(
          "solana.health.no_account",
          this.programId.toBase58(),
        );
        return false;
      }

      if (!info.executable) {
        console.error(
          "solana.health.not_executable",
          this.programId.toBase58(),
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error(
        "solana.health.rpc_error",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }
  async state(a: Agreement): Promise<ChainState | null> {
    const account = await this.connection.getAccountInfo(
      new PublicKey(this.address(a)),
    );
    if (!account) return null;
    if (
      !account.owner.equals(this.programId) ||
      account.data.length !== 250 ||
      !account.data.subarray(0, 8).equals(discriminator("account:Agreement"))
    )
      throw new DomainError(
        "CHAIN_ACCOUNT",
        "Unexpected account owner or layout",
      );
    const data = account.data;
    const s: ChainState = {
      buyer: new PublicKey(data.subarray(40, 72)).toBase58(),
      provider: new PublicKey(data.subarray(72, 104)).toBase58(),
      mint: new PublicKey(data.subarray(104, 136)).toBase58(),
      verifier: new PublicKey(data.subarray(136, 168)).toBase58(),
      requirementsHash: data.subarray(168, 200).toString("hex"),
      hash: data.subarray(200, 232).toString("hex"),
      amount: data.readBigUInt64LE(232),
      deadline: Number(data.readBigInt64LE(240)),
      state: states[data[248]],
    };
    if (
      s.buyer !== a.buyerWallet ||
      s.provider !== a.providerWallet ||
      s.mint !== a.mint ||
      s.amount !== units(a.amount) ||
      s.deadline !== a.deadline ||
      s.requirementsHash !== a.requirementsHash ||
      s.verifier !== this.signers.verifier.getPublicKey()
    )
      throw new DomainError(
        "CHAIN_MISMATCH",
        "Agreement differs from on-chain terms",
      );
    return s;
  }
  instruction(
    action: ChainAction,
    a: Agreement,
    approved = true,
  ): { instruction: TransactionInstruction; signer: AgentSigner } {
    const buyer = new PublicKey(a.buyerWallet),
      provider = new PublicKey(a.providerWallet),
      verifier = new PublicKey(this.signers.verifier.getPublicKey()),
      mint = new PublicKey(a.mint),
      pda = new PublicKey(this.address(a)),
      vault = getAssociatedTokenAddressSync(mint, pda, true);
    let keys: AccountMeta[],
      data = Buffer.alloc(0),
      signer: AgentSigner;
    if (action === "initialize") {
      signer = this.signers.buyer;
      keys = [
        meta(buyer, true, true),
        meta(provider),
        meta(verifier),
        meta(mint),
        meta(pda, false, true),
        meta(vault, false, true),
        meta(TOKEN_PROGRAM_ID),
        meta(ASSOCIATED_TOKEN_PROGRAM_ID),
        meta(SystemProgram.programId),
      ];
      const n = Buffer.alloc(16);
      n.writeBigUInt64LE(units(a.amount));
      n.writeBigInt64LE(BigInt(a.deadline), 8);
      data = Buffer.concat([
        idBytes(a.id),
        n,
        Buffer.from(a.requirementsHash, "hex"),
      ]);
    } else if (action === "fund") {
      signer = this.signers.buyer;
      keys = [
        meta(buyer, true),
        meta(pda, false, true),
        meta(mint),
        meta(getAssociatedTokenAddressSync(mint, buyer), false, true),
        meta(vault, false, true),
        meta(TOKEN_PROGRAM_ID),
      ];
    } else if (action === "accept" || action === "submit") {
      signer = this.signers.provider;
      keys = [meta(provider, true), meta(pda, false, true)];
      if (action === "submit")
        data = Buffer.from(a.evidence!.contentHash, "hex");
    } else if (action === "approve") {
      signer = this.signers.verifier;
      keys = [meta(verifier, true), meta(pda, false, true)];
      data = Buffer.concat([
        Buffer.from(a.evidence!.contentHash, "hex"),
        Buffer.from([approved ? 1 : 0]),
      ]);
    } else if (action === "cancel") {
      signer = this.signers.buyer;
      keys = [meta(buyer, true), meta(pda, false, true)];
    } else {
      signer = action === "settle" ? this.signers.verifier : this.signers.buyer;
      keys = [
        meta(new PublicKey(signer.getPublicKey()), true),
        meta(pda, false, true),
        meta(mint),
        meta(vault, false, true),
        meta(
          getAssociatedTokenAddressSync(
            mint,
            action === "settle" ? provider : buyer,
          ),
          false,
          true,
        ),
        meta(TOKEN_PROGRAM_ID),
      ];
    }
    if (
      (action === "initialize" ||
        action === "fund" ||
        action === "refund" ||
        action === "cancel") &&
      signer.getPublicKey() !== a.buyerWallet
    )
      throw new DomainError(
        "SIGNER_UNAVAILABLE",
        "Configure a buyer signer adapter for this wallet",
      );
    if (
      (action === "accept" || action === "submit") &&
      signer.getPublicKey() !== a.providerWallet
    )
      throw new DomainError(
        "SIGNER_UNAVAILABLE",
        "Configure a provider signer adapter for this wallet",
      );
    return {
      instruction: new TransactionInstruction({
        programId: this.programId,
        keys,
        data: Buffer.concat([discriminator(`global:${ixNames[action]}`), data]),
      }),
      signer,
    };
  }
  async execute(action: ChainAction, a: Agreement, approved = true) {
    const previous = await this.state(a),
      target = {
        initialize: "CREATED",
        fund: "FUNDED",
        accept: "ACCEPTED",
        submit: "SUBMITTED",
        approve: approved ? "VERIFIED" : "REJECTED",
        settle: "SETTLED",
        refund: "REFUNDED",
        cancel: "CANCELLED",
      }[action];
    const { instruction, signer } = this.instruction(action, a, approved);
    if (previous && (previous.state === target || action === "initialize")) {
      if (
        ["submit", "approve"].includes(action) &&
        previous.hash !== a.evidence?.contentHash
      )
        throw new DomainError(
          "HASH_MISMATCH",
          "Recovery requires the original evidence payload",
        );
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(this.address(a)),
        { limit: 50 },
      );
      for (const s of signatures.filter((s) => !s.err)) {
        const tx = await this.connection.getTransaction(s.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        const accountKeys = tx
          ? [
              ...tx.transaction.message.staticAccountKeys,
              ...(tx.meta?.loadedAddresses?.writable ?? []),
              ...(tx.meta?.loadedAddresses?.readonly ?? []),
            ]
          : [];
        if (
          tx &&
          !tx.meta?.err &&
          tx.transaction.message.compiledInstructions.some(
            (i) =>
              accountKeys[i.programIdIndex].equals(this.programId) &&
              Buffer.from(i.data).equals(instruction.data) &&
              i.accountKeyIndexes.length === instruction.keys.length &&
              i.accountKeyIndexes.every((index, j) =>
                accountKeys[index].equals(instruction.keys[j].pubkey),
              ),
          )
        )
          return s.signature;
      }
      throw new DomainError(
        "RECONCILIATION_REQUIRED",
        "On-chain action exists but its signature is outside the RPC history window",
      );
    }
    const block = await this.connection.getLatestBlockhash();
    const tx = await signer.signTransaction(
      new Transaction({
        feePayer: new PublicKey(signer.getPublicKey()),
        ...block,
      }).add(instruction),
    );
    const raw = tx.serialize(),
      signature = bs58.encode(tx.signature!);
    await this.connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
    });
    const confirmation = await this.connection.confirmTransaction(
      { ...block, signature },
      "confirmed",
    );
    if (confirmation.value.err)
      throw new DomainError("CHAIN_REJECTED", "Escrow transaction rejected");
    if ((await this.state(a))?.state !== target)
      throw new DomainError(
        "CHAIN_CONFIRMATION",
        "Confirmed transaction did not reach the expected state",
      );
    return signature;
  }
}
export class UnavailableEscrow implements EscrowGateway {
  address(_a: Agreement): string {
    throw new DomainError(
      "CHAIN_UNAVAILABLE",
      "Build and deploy the Anchor program; configure mint and signer paths.",
      503,
    );
  }
  async state(_a: Agreement): Promise<ChainState | null> {
    throw new DomainError(
      "CHAIN_UNAVAILABLE",
      "Solana escrow is not configured.",
      503,
    );
  }
  async execute(_action: ChainAction, _a: Agreement): Promise<string> {
    throw new DomainError(
      "CHAIN_UNAVAILABLE",
      "No payment was submitted: Solana escrow is not configured.",
      503,
    );
  }
  async health() {
    return false;
  }
}
