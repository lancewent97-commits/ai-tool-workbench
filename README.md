# AI Tool Workbench

AI Tool Workbench is a platform for discovering, packaging, downloading, contributing, and governing reusable AI tools. Users describe a goal, review a structured plan, package existing tools or missing-component prompts, and hand the resulting bundle to a local coding agent for execution.

> Current release: `v0.1.0-beta`. The core workflow is ready for local evaluation and internal pilots. Production deployments still require organization-specific model access, malware scanning, storage planning, backup validation, and security review.

## Features

- **AI requirement discovery** — turns a short request into a structured brief with bounded clarification rounds.
- **Tool catalog** — supports modules, categories, tags, versions, validation status, and derivative relationships.
- **AI and manual packaging** — locks tool versions, goals, deliverables, and agent modification boundaries into a portable ZIP package.
- **Download provenance** — records each download as an immutable credential linked to its tools and versions.
- **Contribution workflow** — accepts locally adjusted packages through resumable upload, static preflight checks, human review, and versioned publication.
- **Administration** — manages tool assets, releases, contribution reviews, AI prompts, platform rules, accounts, and audit events.

## Workflow

```text
Describe a goal
  → Confirm the structured requirement brief
  → Select a recommended tool set or generate missing-component prompts
  → Build a universal agent package
  → Execute and refine it with a local coding agent
  → Sanitize, upload, review, and publish the result
```

## Technology

- Next.js 16, React 19, and TypeScript
- Fastify and Zod
- PostgreSQL 16
- Pluggable AI providers with versioned prompts and context compression
- Resumable file uploads and immutable package versions
- pnpm workspaces, Docker Compose, Playwright, and GitHub Actions

## Repository Structure

```text
apps/web                 User workbench and administration UI
apps/api                 Fastify API
packages/ai              AI orchestration, prompts, policies, and evaluations
packages/contracts       Shared API and domain contracts
packages/db              PostgreSQL migrations and repositories
packages/package-builder Portable agent-package builder
deploy                    Docker and Nginx deployment configuration
tests/e2e                 End-to-end and route checks
```

## Getting Started

Requirements: Node.js 22, pnpm 11, and Docker.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

Start the API:

```bash
pnpm dev:api:test
```

Start the web application in another terminal:

```bash
pnpm dev:test
```

Open `http://127.0.0.1:3000`.

To create the first administrator, run `pnpm bootstrap:admin`, then use the one-time activation token to call `POST /v1/auth/activate`. Never place activation tokens, credentials, or real API keys in source files, issues, or chat messages.

## Quality Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
pnpm --registry=https://registry.npmjs.org audit
```

## AI Provider Boundaries

- `mock` is the default deterministic provider for local workflow testing.
- `external-dev` supports sanitized development data only. The included adapter targets DeepSeek.
- `internal` is reserved for an organization-managed model endpoint and authentication mechanism.

Do not send internal tool content, production data, personal information, or credentials to an external development provider.

## Production Readiness

The repository includes production-oriented Compose configuration, environment validation, backup scripts, secure cookie settings, and automated quality checks. It is not a substitute for deployment-specific acceptance. Before production use, connect an internal model and enterprise malware scanner, configure TLS and persistent storage, and complete backup recovery, capacity, and security testing.

## License

Licensed under the [Apache License 2.0](./LICENSE).
