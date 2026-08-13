FROM node:22-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/storefront/package.json ./apps/storefront/package.json
COPY packages ./packages

RUN pnpm install --frozen-lockfile

# Shared workspace packages are consumed through their built `dist` output;
# build them so Next.js can resolve @sabz/api-client at dev runtime.
RUN pnpm --filter @sabz/types build && pnpm --filter @sabz/api-client build

COPY apps/storefront ./apps/storefront

EXPOSE 3001

CMD ["pnpm", "--filter", "@sabz/storefront", "dev"]
