# Contributing

Thank you for contributing to AI Tool Workbench.

## Development Setup

1. Install Node.js 22, pnpm 11, and Docker.
2. Copy `.env.example` to `.env.local`.
3. Run `pnpm install --frozen-lockfile`.
4. Start PostgreSQL with `pnpm db:up`.
5. Run migrations and seed development data with `pnpm db:migrate` and `pnpm db:seed`.
6. Start the API and web application in separate terminals with `pnpm dev:api:test` and `pnpm dev:test`.

## Before Submitting a Pull Request

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Add or update tests when changing business behavior. Keep API contracts in `packages/contracts`, AI policies and prompts in `packages/ai`, and persistence logic in `packages/db`.

## Security and Data Handling

- Never commit `.env` files, API keys, activation tokens, credentials, production data, internal tools, or personal information.
- Use only synthetic or sanitized fixtures.
- Do not weaken package path validation, upload preflight checks, authorization rules, or provider data boundaries without tests and a clear security rationale.

## Pull Requests

Keep pull requests focused. Explain the problem, the chosen behavior, affected routes or contracts, and how the change was verified. Breaking schema or API changes must include a migration and an explicit compatibility note.
