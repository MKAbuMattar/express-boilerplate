# Express Boilerplate

A boilerplate for building scalable applications with Express.js and TypeScript.

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2020.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/container-Docker-blue.svg)](https://www.docker.com/)
[![CI Build](https://github.com/MKAbuMattar/express-boilerplate/actions/workflows/build.yml/badge.svg)](https://github.com/MKAbuMattar/express-boilerplate/actions/workflows/build.yml)
[![CI Tests](https://github.com/MKAbuMattar/express-boilerplate/actions/workflows/test.yml/badge.svg)](https://github.com/MKAbuMattar/express-boilerplate/actions/workflows/test.yml)
[![CI Lint](https://github.com/MKAbuMattar/express-boilerplate/actions/workflows/code-quality.yml/badge.svg)](https://github.com/MKAbuMattar/express-boilerplate/actions/workflows/code-quality.yml)

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
- [GitHub Environments](#github-environments)
  - [Adding the `PAT_TOKEN` Secret](#adding-the-pat_token-secret)
  - [Using the Secret in Your Workflow](#using-the-secret-in-your-workflow)
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
pnpm dev
```

The server will start on the port specified in your `.env` file (default: 8080).

### Building for Production

To build the project for production:

```sh
pnpm build
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

## GitHub Environments

GitHub environments empower you to manage deployment settings and configure workflows in GitHub Actions more effectively. This feature enhances the security, control, and visibility of your CI/CD pipeline. Below, you'll find a step-by-step guide to setting up environments and securely managing secrets, such as `PAT_TOKEN`, for Docker image builds.

### Why Use GitHub Environments?

Using GitHub Environments offers several advantages:

- **Security**: Secrets stored in environments are encrypted, ensuring that sensitive information is only accessible to workflows running within those environments.
- **Controlled Deployments**: You can enforce rules for approval before deployments, ensuring that changes are reviewed before going live.
- **Environment-Specific Settings**: Manage different configurations tailored for development, staging, and production, reducing the risk of errors during deployment.

### Setting Up GitHub Environments

Follow these steps to set up GitHub Environments for your project:

1. **Navigate to Your Repository**:

   - Open your web browser and go to your GitHub repository.

2. **Access Environment Settings**:

   - Click on the **Settings** tab at the top of the repository page.
   - In the left sidebar, find and select **Environments** under the **Security** section.

3. **Create a New Environment**:

   - Click the **New environment** button.
   - Provide a meaningful name for your environment (e.g., `development`, `staging`, `production`) to indicate its purpose.
   - (Optional) Configure specific rules, such as requiring manual approval for deployment, to enhance control over the process.

4. **Add Secrets to Your Environment**:
   - After creating your environment, click on its name to access its settings.
   - In the **Secrets** section, click on **Add secret**.
   - Enter `PAT_TOKEN` as the secret name and paste your Personal Access Token into the value field.
   - Click **Add secret** to save the secret securely.

### Using Secrets in Your Workflow

To utilize the `PAT_TOKEN` secret in your GitHub Actions workflow for building Docker images, reference the secret using the syntax shown in the example workflow below. You can find this configuration in your [docker-image.yml](.github/workflows/docker-image.yml) file:

```yaml
name: Docker Image CI

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  build:
    runs-on: ubuntu-latest
    environment: development # Specify the environment

    steps:
      - uses: actions/checkout@v4

      # Log in to the GitHub Container Registry only on main branch pushes
      - name: Login to GitHub Container Registry
        if: github.ref == 'refs/heads/main'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.PAT_TOKEN }}

      # Add additional steps here (e.g., building and pushing the Docker image)
```

### Best Practices for Managing GitHub Environments

- **Limit Access**: Only grant access to environments to those who require it. Utilize branch protection rules to ensure that only specific users can deploy to production.
- **Review Approvals**: For sensitive environments, set up an approval process to require reviews before deployments occur. This adds a layer of safety to your deployment strategy.
- **Monitor Usage**: Regularly review and audit your environment settings and secrets to ensure compliance with best practices and security policies.

By following these guidelines, you can establish a robust and secure CI/CD process that enhances your development workflow while maintaining best practices for managing sensitive information.

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

### Additional Guidelines

- Follow the coding style outlined in the `Biome` configuration files.
- Use the PR template provided in the `.github` folder to ensure all necessary details are included when submitting a pull request.
- Report issues using the provided issue template.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details by [@MKAbuMattar](https://github.com/MKAbuMattar).

## Further Reading

If you want to dive deeper into some of the technologies used in this project, here are some useful resources:

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [Pino Logger](https://getpino.io/)
- [Vitest Testing Framework](https://vitest.dev/)
- [Biome Linting](https://biomejs.dev/)
