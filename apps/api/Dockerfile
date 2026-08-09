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

COPY apps/api ./apps/api

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @sabz/api prisma:generate && pnpm --filter @sabz/api exec prisma migrate deploy && pnpm --filter @sabz/api dev"]
