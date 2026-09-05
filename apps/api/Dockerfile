FROM node:22-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# FFmpeg is required for the server-side video watermarking pipeline
# (CATALOG-007). The bundled Vazirmatn font renders the Persian watermark text
# without installing extra system fonts.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/storefront/package.json ./apps/storefront/package.json
COPY packages ./packages

RUN pnpm install --frozen-lockfile

# Shared workspace packages are consumed through their built `dist` output
# (.dockerignore excludes dist from the build context); build them so the
# API can resolve @sabz/types at dev runtime.
RUN pnpm --filter @sabz/types build && pnpm --filter @sabz/api-client build

COPY apps/api ./apps/api

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @sabz/api prisma:generate && pnpm --filter @sabz/api exec prisma migrate deploy && pnpm --filter @sabz/api dev"]
