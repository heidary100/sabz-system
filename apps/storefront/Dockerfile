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

COPY apps/storefront ./apps/storefront

EXPOSE 3001

CMD ["pnpm", "--filter", "@sabz/storefront", "dev"]
