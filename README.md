# Express Boilerplate

A boilerplate for building scalable applications with Express.js and TypeScript.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
  - [Running the Server](#running-the-server)
  - [Building for Production](#building-for-production)
  - [Running with Docker](#running-with-docker)
- [Project Structure](#project-structure)
- [Git Strategy](#git-strategy)
  - [Branches](#branches)
  - [Workflow](#workflow)
  - [Semantic Commit Messages and Versioning](#semantic-commit-messages-and-versioning)
- [Testing](#testing)
- [Linting and Formatting](#linting-and-formatting)
- [Contributing](#contributing)
- [License](#license)
- [Further Reading](#further-reading)

## Introduction

This boilerplate provides a strong foundation for building applications using Express.js and TypeScript. It follows best practices for code quality, structure, and development workflow. The repository also supports Docker and includes preconfigured Git workflows for streamlined project management.

## Features

- **Express.js** with **TypeScript**: Combines the simplicity of Express.js with the type safety and scalability of TypeScript.
- **Docker** support: Ensures consistent environment setups across different machines, simplifying deployment and scaling.
- Pre-configured environment-based configuration: Seamlessly manage different configurations for development, staging, and production.
- Centralized **logging** with [Pino](https://getpino.io/): Pino is a high-performance logger designed to handle heavy workloads with minimal overhead.
- **Error handling** middleware: Built-in centralized error handling to manage different error types efficiently.
- Unit and integration testing with [Vitest](https://vitest.dev/): Vitest provides fast and simple testing for both unit and integration tests.
- **API documentation** with OpenAPI Swagger: Automatically generate API documentation from your codebase.
- **Validation** with [Zod](https://zod.dev/): A TypeScript-first schema declaration and validation library.
- **Linting** and **Formatting** with [Biome](https://biomejs.dev/): Ensures code consistency and quality across the project.
- **Semantic Versioning** and **Conventional Commits** integration: Ensures a structured release process and maintainable commit history.
- **GitHub Actions** for CI/CD pipelines: Automates testing, linting, and deployment workflows.

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

The server will start on the port specified in your `.env` file (default: 8080).

### Building for Production

To build the project for production:

```sh
pnpm run build
```

Then, to start the production server:

```sh
pnpm start
```

### Running with Docker

Using Docker helps maintain a consistent development environment across machines. To build and run the project using Docker, use the following commands:

```sh
docker-compose up -d --build
```

## Project Structure

```
express-boilerplate/
├── .github/               # GitHub configurations for CI/CD and issue templates
├── .vscode/               # VSCode-specific settings for workspace
├── plugins/               # Custom plugins (e.g., Pino transports)
├── src/                   # Core application source code
│   ├── api/               # API routes and controllers
│   ├── bin/               # Application entry point (startup scripts)
│   ├── configs/           # Configuration files for logger, environment, etc.
│   ├── docs/              # API documentation and OpenAPI specs
│   ├── libs/              # Reusable libraries
│   ├── middlewares/       # Custom middleware logic
│   ├── models/            # Data models and schemas
│   ├── schemas/           # Validation schemas
│   ├── utils/             # Utility functions for the app
│   ├── validations/       # Business logic validations
│   └── index.ts           # Main server file
├── Dockerfile             # Docker configuration
├── compose.yml            # Docker Compose for multi-service applications
├── .env.example           # Example environment variables
├── LICENSE                # License file
├── package.json           # Project metadata and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md              # Project documentation
```

## Git Strategy

### Branches

- `main`: Reflects the production-ready state of the source code.
- `develop`: Contains the latest delivered changes for the next release.

### Workflow

1. Create a new branch from `main` for each feature or bug fix.
   - Use descriptive branch names with a prefix (e.g., `feature/`, `bugfix/`).
2. Make changes and commit them.
   - Follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.
   - Write descriptive commit messages.
3. Push the branch to the remote repository.
4. Create a pull request to merge the branch into `develop`.
5. After approval, merge the pull request into `develop`.
6. Create a pull request to merge `develop` into `main`.
7. After approval, merge the pull request into `main`.

### Semantic Commit Messages and Versioning

This project adheres to [Semantic Versioning](https://semver.org/) and uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) to manage releases. Every commit message and version change should follow this standard:

- **fix**: Patches a bug in your codebase (`PATCH` release) or a hotfix.
  ```sh
  git commit -m "fix(api): fix health check route"
  ```
- **feat**: Introduces a new feature (`MINOR` release) or enhancement.
  ```sh
  git commit -m "feat(api): add user route"
  ```
- **BREAKING CHANGE**: Introduces breaking changes (`MAJOR` release) that require a manual update.
  ```sh
  git commit -m "feat!(api): change user route to use UUID"
  ```
- **chore**: Updates dependencies, refactors code, or makes other changes that don't affect the user-facing code.
  ```sh
  git commit -m "chore: update dependencies"
  ```
- **docs**: Updates documentation, README, or other non-code files.
  ```sh
  git commit -m "docs: update README"
  ```
- **ci**: Updates CI/CD configurations or workflows.
  ```sh
  git commit -m "ci: add GitHub Actions workflow"
  ```

## Testing

Testing is crucial to ensure code reliability and prevent regressions. This project uses [Vitest](https://vitest.dev/) for running unit and integration tests.

- **Unit Tests**: Test individual units of code in isolation.
- **Integration Tests**: Test the interaction between different units of code.

- **Test Files**: Test files are located in the `src` directory with the `.test.ts` extension.
  ```sh
  pnpm test
  ```
- **Coverage Reports**: To generate a code coverage report:
  ```sh
  pnpm test:cov
  ```
- **Watch Mode**: To run tests in watch mode (ideal for active development):
  ```sh
  pnpm test:dev
  ```

> [!TIP]
> Focus on writing tests that verify the behavior of the code, not implementation details.

## Linting and Formatting

The project uses [Biome](https://biomejs.dev/) for linting and formatting. This helps ensure that the code adheres to a consistent style.

To run the linter:

```sh
pnpm lint
```

To format code:

```sh
pnpm fmt
```

To fix linting and formatting issues:

```sh
pnpm lint:fix
pnpm fmt:fix
```

## Contributing

Contributions are welcome! Please follow the guidelines in [CONTRIBUTING.md](.github/CONTRIBUTING.md). If you don't have this file, consider creating one with instructions for how to fork the project, make changes, and submit pull requests.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

## Further Reading

If you want to dive deeper into some of the technologies used in this project, here are some useful resources:

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [Pino Logger](https://getpino.io/)
- [Vitest Testing Framework](https://vitest.dev/)
- [Biome Linting](https://biomejs.dev/)
