import { DomainError } from "../../../packages/shared/src/index.js";
/** Operator allowlist, no redirects, bounded streaming, and a total deadline. */
export async function executeProvider(endpoint: string, input: unknown) {
  const url = new URL(endpoint);
  if (
    url.username ||
    url.password ||
    !(process.env.PROVIDER_ALLOWED_ORIGINS ?? "")
      .split(",")
      .includes(url.origin)
  )
    throw new DomainError(
      "ENDPOINT_NOT_ALLOWED",
      "Provider endpoint is not allowlisted",
    );
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok || !response.body)
    throw new DomainError("PROVIDER_ERROR", "Provider returned an error", 502);
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100000) {
        await reader.cancel();
        throw new DomainError(
          "EVIDENCE_TOO_LARGE",
          "Provider response exceeds limit",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new DomainError(
      "PROVIDER_FORMAT",
      "Provider returned invalid JSON",
      502,
    );
  }
}
