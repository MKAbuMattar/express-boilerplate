FROM node:^24.0.0-alpine@sha256:f36fed0b2129a8492535e2853c64fbdbd2d29dc1219ee3217023ca48aebd3787 AS base

# Install pnpm
RUN npm install -g pnpm@latest

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
