FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/verifier/package.json packages/verifier/package.json
COPY packages/solana/package.json packages/solana/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/x402/package.json packages/x402/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec tsup apps/api/src/server.ts --format esm --platform node --out-dir dist/api

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4000 DEMO_MODE=false
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/api/server.js"]
