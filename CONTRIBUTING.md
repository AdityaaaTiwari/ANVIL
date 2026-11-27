# Contributing to ANVIL

Thank you for your interest in contributing to ANVIL!

## Governance & Contribution Model

To maintain code stability and security:
- **No Direct Pushes:** Direct commits or pushes to the `main` branch are blocked.
- **Review First:** All contributions must be submitted as Pull Requests (PRs) from your own fork.
- **Maintainer Approval:** Every PR requires review and approval from the maintainer (@AdityaaaTiwari) before it can be merged.

## How to Contribute

1. **Fork the Repository:** Create a fork under your personal GitHub account.
2. **Clone & Branch:** Clone your fork and create a descriptive branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Run Checks Locally:** Ensure all checks pass before submitting:
   ```bash
   npm ci
   npm run format:check
   npm run lint
   npm run build
   npm test
   ```
   If you changed `catalog/` or bumped the version, regenerate the Claude Code plugin with `npm run build && node dist/cli.js plugin build` and commit `plugin/`. CI fails when it is stale.
4. **Commit Clearly:** Write concise, clear commit messages describing your changes.
5. **Open a Pull Request:** Submit your PR against the `main` branch of the upstream repository. Complete the PR template checklist.

## Guidelines

- Keep pull requests focused on a single change or fix.
- Include automated tests for any new functionality or bug fixes.
- Never commit credentials, secrets, private keys, or sensitive environment variables.
- Contributions are licensed under the repository's MIT License.
