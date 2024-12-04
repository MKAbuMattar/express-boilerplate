FROM node:jod-alpine@sha256:96cc8323e25c8cc6ddcb8b965e135cfd57846e8003ec0d7bcec16c5fd5f6d39f AS base

# Environment variables
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy application code
COPY . /app
WORKDIR /app

# Install dependencies stage for production
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Build stage for the application
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

# Final stage
FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

# Expose port and start the application
EXPOSE 8080

# Set ARGs and ENVs
ARG NODE_ENV=""
ARG PORT=""
ARG HOST=""
ARG CORS_WHITELIST=""
ARG API_KEY=""

ENV NODE_ENV=${NODE_ENV}
ENV PORT=${PORT}
ENV HOST=${HOST}
ENV CORS_WHITELIST=${CORS_WHITELIST}
ENV API_KEY=${API_KEY}

CMD [ "pnpm", "start" ]
