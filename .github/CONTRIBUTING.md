# Contributing to Express Boilerplate

Thank you for considering contributing to this project! Please follow the guidelines below to help maintain a smooth and consistent workflow.

## Getting Started

### 1. Fork the Repository

Fork the repository from GitHub to create a copy under your GitHub account.

### 2. Clone the Fork

Clone the repository to your local machine:

```bash
git clone https://github.com/YOUR_USERNAME/express-boilerplate.git
cd express-boilerplate
```

### 3. Install Dependencies

Install the project dependencies:

```bash
pnpm install
```

### 4. Set Up Environment Variables

Copy the example environment file and update the values as needed:

```bash
cp .env.example .env
```

### 5. Run the Application

To start the development server, run:

```bash
pnpm run dev
```

The server will start on the port specified in your `.env` file.

## Pull Request Process

1. **Create a New Branch**  
   Before working on any changes, create a new branch off the `main` branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**  
   Ensure your code adheres to the project style guidelines and includes appropriate tests.

3. **Test Your Changes**  
   Run the unit and integration tests to verify your changes:

   ```bash
   pnpm run test
   ```

4. **Commit Your Changes**  
   Use a clear and descriptive commit message:

   ```bash
   git add .
   git commit -m "Add a brief description of the feature or fix"
   ```

5. **Push Your Branch**  
   Push the branch to your forked repository:

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Submit a Pull Request**  
   Go to the original repository and submit a Pull Request from your branch. Ensure the PR includes:

   - A description of the changes
   - A reference to the issue (if applicable)
   - Any relevant test results or screenshots

7. **PR Review**  
   Your Pull Request will be reviewed, and changes may be requested before it is merged. Make sure to respond to any feedback promptly and update your PR as needed.

## Code Guidelines

- Use camelCase for variable and function names.
- Maintain consistent formatting (preferably via a linter like Biome).
- Write unit tests and integration tests where applicable.
- Use meaningful commit messages and PR titles.

## Reporting Bugs

If you find a bug, please create an issue on GitHub. Include details such as:

- A clear description of the problem
- Steps to reproduce the issue
- Relevant logs or screenshots
- Your operating system and Node.js version

## Feature Requests

If you have an idea for a new feature, please open a new issue describing the feature and the problem it solves. We encourage discussion and feedback before implementing large features.

## License

By contributing to this repository, you agree that your contributions will be licensed under the MIT License.
