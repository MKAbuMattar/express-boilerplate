# Express Boilerplate

A boilerplate for Express.js with TypeScript.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [License](#license)

## Introduction

This repository provides a boilerplate for building applications using Express.js with TypeScript. It includes a basic setup to get started quickly and follows best practices for project structure and code quality.

## Features

- Express.js with TypeScript
- Docker support
- Example routes and middleware
- Environment-based configuration
- Logging with Pino
- Error handling middleware
- Unit and integration tests

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later)
- [Docker](https://www.docker.com/get-started) (optional, for containerization)

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/MKAbuMattar/express-boilerplate.git
   cd express-boilerplate
   ```

2. Install dependencies:

   ```sh
   pnpm install
   ```

3. Set up environment variables:
   ```sh
   cp .env.example .env
   ```

## Usage

### Running the Server

To start the development server, run:

```sh
pnpm run dev
```

The server will start on the port specified in your `.env` file.

### Building for Production

To build the project for production, run:

```sh
pnpm run build
```

To start the production server, run:

```sh
pnpm start
```

### Running with Docker

To build and run the project using Docker, run:

```sh
docker-compose up -d --build
```

## Project Structure

```
express-boilerplate/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/
│   │   ├── build.yml
│   │   ├── code-quality.yml
│   │   ├── label-syncer.yml
│   │   └── test.yml
|   ├── CODE_OF_CONDUCT.md
|   ├── dependabot.yml
|   ├── labels.yml
|   └── SECURITY.md
├── .vscode/
├── plugins/
│   └── pino-transport-rotating-file/
│       ├── index.d.ts
│       ├── index.mjs
│       ├── package.json
│       └── README.md
├── src/
│   ├── api/
│   │   ├── health-check/
│   │   │   ├── __tests__/
│   │   │   │   └── health-check.router.test.ts
│   │   │   └── health-check.router.ts
│   │   └── health-check/
│   │       ├── __tests__/
│   │       │   ├── user.router.test.ts
│   │       │   └── user.service.test.ts
│   │       ├── user.controller.ts
│   │       ├── user.model.ts
│   │       ├── user.repository.ts
│   │       ├── user.router.ts
│   │       └── user.service.ts
│   ├── bin/
│   │   └── www.ts
│   ├── configs/
│   │   └── logger-options.config.ts
│   ├── docs/
│   │   ├── __tests__/
│   │   │   └── openapi-router.doc.test.ts
│   │   ├── openapi-document-generator.doc.ts
│   │   ├── openapi-response-builders.doc.ts
│   │   └── openapi-router.doc.ts
│   ├── libs/
│   │   └── logger.lib.ts
│   ├── middlewares/
│   │   ├── __tests__/
│   │   │   ├── auth-api-key.middleware.test.ts
│   │   │   ├── error-handler.middleware.test.ts
│   │   │   └── request-logger.middleware.test.ts
│   │   ├── auth-api-key.middleware.ts
│   │   ├── error-handler.middleware.ts
│   │   └── request-logger.middleware.ts
│   ├── models/
│   │   └── service-response.model.ts
│   ├── schemas/
│   │   └── express-session.schema.ts
│   ├── utils/
│   │   ├── env-config.util.ts
│   │   └── http-handlers.util.ts
│   ├── validations/
│   │   └── common.validation.ts
│   └── index.ts
├── .dockerignore
├── .env.example
├── .gitignore
├── .npmrc
├── .nvmrc
├── biome.json
├── compose.yml
├── Dockerfile
├── Dockerfile.aws
├── LICENSE
├── package.json
├── pnpm-workspace.yaml
├── package.json
├── README.md
├── tsconfig.json
├── tsup.config.ts
└── vite.config.mts
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
