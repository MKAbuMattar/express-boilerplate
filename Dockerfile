# Docker Hub by default. For AWS ECR Public (no Docker Hub rate limits):
#   docker build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:26-alpine .
ARG NODE_IMAGE=node:26-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94

FROM ${NODE_IMAGE} AS base
RUN npm install -g pnpm@12.16.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# One-shot local cert generator used by compose (see compose.yml `certs`).
FROM build AS certs
RUN apk add --no-cache openssl
COPY scripts ./scripts
ENTRYPOINT ["sh", "-c", "node_modules/.bin/tsx scripts/generate-certs.ts /certs && chown -R node:node /certs"]

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8443
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Non-root cannot bind 443 inside the container; publish 443 -> 8443 instead.
# Secrets come from the runtime environment and TLS files from a mount at
# /app/certs, never from build args.
USER node
EXPOSE 8443
CMD ["node", "dist/main.js"]
