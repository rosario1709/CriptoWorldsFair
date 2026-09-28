import {
  SolanaEscrow,
  UnavailableEscrow,
  DevelopmentSigner,
} from "../../../packages/solana/src/index.js";
import type { Agreement } from "../../../packages/shared/src/index.js";
import { config } from "./config.js";
export async function gateway(a?: Agreement) {
  if (!config.PROOFCOMMERCE_PROGRAM_ID || !config.PAYMENT_TOKEN_MINT)
    return new UnavailableEscrow();
  const buyer = await DevelopmentSigner.fromFile(
    process.env.AGENT_SIGNER_KEY_PATH ?? ".local/keys/buyer.json",
  );
  const provider = await DevelopmentSigner.fromFile(
    a?.providerAgentId === "malicious" && config.demo
      ? ".local/keys/malicious.json"
      : (process.env.PROVIDER_SIGNER_KEY_PATH ?? ".local/keys/provider.json"),
  );
  const verifier = await DevelopmentSigner.fromFile(
    process.env.VERIFIER_SIGNER_KEY_PATH ?? ".local/keys/verifier.json",
  );
  return new SolanaEscrow(
    config.SOLANA_RPC_URL,
    config.PROOFCOMMERCE_PROGRAM_ID,
    { buyer, provider, verifier },
  );
}
