# Deployment

## Web

On Vercel import the monorepo, choose root `apps/web`, use Next.js, and allow workspace files outside that directory. Install from the repository root with `pnpm install --frozen-lockfile`; build with `pnpm --filter @proofcommerce/web build`. Set `NEXT_PUBLIC_API_URL` to the public HTTPS API at build time. Optionally set `NEXT_PUBLIC_GITHUB_URL` to the actual published repository. Do not use an invented URL.

Alternatively use `pnpm --filter @proofcommerce/web start` after `pnpm build`. Next standalone output is also enabled. Deploy static assets along with standalone output if building a dedicated web container.

## API and database

```sh
docker build --target api -t proofcommerce-api .
docker run --rm --env-file .env.production \
  -v /secure/proofcommerce-keys:/run/secrets:ro \
  -p 4000:4000 proofcommerce-api
```

The API image sets NODE_ENV=production, DEMO_MODE=false and API_HOST=0.0.0.0. Configure database URL, CORS, public Solana settings and secret signer paths. The node user must have read access to mounted signer files. No key files or `.env` are copied into the image.

Run `pnpm db:migrate` as a release task with the target DATABASE_URL before starting API replicas. The SQL migrations are idempotent CREATE statements in sorted order. Back up PostgreSQL and its journal before upgrades. Do not seed development wallets into a production database.

Health check: GET /health. Database failure makes it fail; chainReady separately indicates the actual executable program availability. A healthy API process is not proof of a completed financial deployment. Configure HTTPS, request limits and SSE streaming at the proxy; disable buffering for `/events/stream` and allow heartbeat traffic. Enforce deployment-level connection quotas.

## Devnet program

Use a Linux/macOS/WSL build environment with Anchor 0.32.1 and Solana 2.3.0. Set network/RPC to devnet and run the deployment/token commands in README. Record the real program ID, mint, public participant keys and deployment signature in the submission notes. Preserve the upgrade key securely; never place it in Git.

Seeded demo services, disposable keys, public evidence and automated actor authorization are for local demonstration. A publicly hosted demo requires an explicitly restricted development environment with test assets, rate/connection limits and clear demo labeling. Do not bypass the production DEMO_MODE guard by treating a public asset service as a local sandbox.

## Release gates

Application CI installs, migrates, seeds, lints, typechecks, tests, builds and runs Playwright. Separate blockchain CI installs pinned Solana/Anchor, deploys a real program to a local validator, creates the token, runs attack/balance tests, runs both CLI demos and enables chain browser tests. Workflows are provided but have not been executed remotely in this session; no passing CI badge is claimed.

Production additionally requires an audited program, isolated signers, upgrade governance, tenant-aware reads, durable long-range transaction reconciliation and a production-grade x402 facilitator. The current Docker image prioritizes reproducibility and includes development dependencies; use an SBOM and dependency pruning as release hardening.
