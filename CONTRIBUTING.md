# Contributing to Copilot Session Viewer

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and collaborative environment.

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the behavior
- **Expected vs actual behavior**
- **Environment details** (Node.js version, OS, browser)
- **Session file examples** (if applicable, sanitize sensitive data)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Use case** - What problem does this solve?
- **Proposed solution** - How should it work?
- **Alternatives considered** - What other approaches did you think about?

### Pull Requests

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following the code style guidelines
4. **Write or update tests** - maintain or improve test coverage
5. **Run all tests**:
   ```bash
   npm run lint:fix
   npm run test:all
   ```
6. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add new feature
   fix: resolve bug in session parsing
   docs: update README
   test: add e2e test for filtering
   ```
7. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
8. **Submit a pull request** to the `main` branch

**Note for fork contributors:**
- CI tests will run automatically on your PR
- You don't need access to secrets (NPM_TOKEN) - only maintainers publish releases
- Your PR will be labeled `external-contribution` automatically


### Code Style Guidelines

- **JavaScript**: Single quotes, no unused variables
- **Error handling**: Always include `{ cause }` when re-throwing
- **Vue 3**: Don't use `.value` in templates (auto-unwrapped)
- **Comments**: Explain *why*, not *what*
- **ESLint**: Zero errors, warnings acceptable

### Testing Requirements

- **Unit tests** for all new logic in `src/`
- **E2E tests** for user-facing features
- **All tests must pass** before merging

### Development Workflow

```bash
# Install dependencies
npm install

# Run dev server (auto-reload)
npm run dev

# Run tests
npm run test:all

# Lint and fix
npm run lint:fix
```

### Project Structure

See `AGENTS.md` for detailed architecture and common tasks.

### Need Help?

- Check `AGENTS.md` for development guidelines
- Review existing issues and pull requests
- Ask questions in issue discussions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
