# Build context is the repo root (pnpm workspace):
#   docker build -t express-boilerplate .
# Docker Hub by default. For AWS ECR Public (no Docker Hub rate limits):
#   docker build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:26-alpine .
ARG NODE_IMAGE=node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
ARG APP=@express-boilerplate/api

FROM ${NODE_IMAGE} AS base
ARG APP
ENV APP=${APP}
RUN npm install -g pnpm@12.18.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY patches ./patches
COPY apps/api/package.json ./apps/api/
COPY packages/common/package.json ./packages/common/
COPY packages/persistence/package.json ./packages/persistence/
COPY packages/service/package.json ./packages/service/

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "${APP}..."
COPY packages ./packages
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./apps/api/
COPY apps/api/src ./apps/api/src
# The api and every layer package it depends on, in dependency order.
RUN pnpm --filter "${APP}..." build

# One-shot local cert generator used by compose (see compose.yml `certs`).
# Keys are group-readable (640, group 1000) so APISIX and Prometheus,
# which run as other users with group_add 1000, can read them. Dev only.
FROM build AS certs
RUN apk add --no-cache openssl
COPY apps/api/scripts ./apps/api/scripts
WORKDIR /app/apps/api
ENTRYPOINT ["sh", "-c", "node_modules/.bin/tsx scripts/generate-certs.ts /certs && chown -R node:node /certs && chmod 640 /certs/*.key"]

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter "${APP}..."

FROM ${NODE_IMAGE} AS runtime
# Patch OS packages to the latest fixes, then remove tools the app never
# runs: npm, npx, corepack and yarn ship their own dependency trees, and
# every CVE in them would otherwise be a CVE in this image.
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
              /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
              /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
# --disable-proto=delete removes the __proto__ accessor: no prototype pollution.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=443 \
    NODE_OPTIONS=--disable-proto=delete
# pnpm links each package's node_modules into /app/node_modules/.pnpm, so
# every path is kept as is. Layers: api -> service -> persistence -> common.
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=prod-deps --chown=node:node /app/packages /app/packages
COPY --from=build --chown=node:node /app/packages/common/dist /app/packages/common/dist
COPY --from=build --chown=node:node /app/packages/persistence/dist /app/packages/persistence/dist
COPY --from=build --chown=node:node /app/packages/service/dist /app/packages/service/dist
COPY --chown=node:node apps/api/package.json /app/apps/api/
COPY --from=build --chown=node:node /app/apps/api/dist /app/apps/api/dist
WORKDIR /app/apps/api
# TLS only, on 443. The process stays non-root: the runtime lowers
# net.ipv4.ip_unprivileged_port_start to 443 (compose `sysctls`, Helm pod
# securityContext). Secrets come from the runtime environment and TLS files
# from a mount at /app/apps/api/certs, never from build args.
USER node
EXPOSE 443
CMD ["node", "dist/main.js"]
