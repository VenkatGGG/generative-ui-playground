# Generative UI Playground

React-only generative UI platform implemented as a pnpm + Turbo monorepo.

## API Versions

- `v1` routes remain available under `/api/*`.
- `v2` parity routes are available under `/api/v2/*` with semantic runtime support (`state`, `repeat`, `visible`, `on`, `watch`, dynamic bindings).

## Core Stack

- Next.js App Router + React
- TypeScript (Node.js runtime for API routes)
- SSE JSONL stream transport
- RFC6902 patch pipeline (backend generated)
- Local stub adapters for LLM, MCP, and persistence

## Workspace Layout

- `apps/web` - Next.js UI studio and API routes
- `packages/contracts` - shared types and zod schemas
- `packages/spec-engine` - normalization, validation, diff/patch utilities
- `packages/renderer-react` - strict registry + recursive renderer
- `packages/client-core` - stream parser + generation reducer
- `packages/orchestrator` - two-pass orchestration workflow
- `packages/integrations` - adapters (stub + real)
- `packages/persistence` - repositories/adapters (in-memory + real)

## Quick Start

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Runtime Provider Selection

- `ADAPTER_MODE=stub` (default) uses local stub adapters.
- `ADAPTER_MODE=real` uses external services.
- `LLM_PROVIDER=gemini` (default in real mode) uses Gemini adapter.
- `LLM_PROVIDER=openai` uses OpenAI adapter.

When `ADAPTER_MODE=real`, required env vars are:

- Shared: `MONGODB_URI`, `MONGODB_DB_NAME`
- Gemini: `GEMINI_API_KEY` (+ optional `GEMINI_BASE_URL`, `GEMINI_PASS1_MODEL`, `GEMINI_PASS2_MODEL`)
- OpenAI: `OPENAI_API_KEY` (+ optional `OPENAI_BASE_URL`, `OPENAI_PASS1_MODEL`, `OPENAI_PASS2_MODEL`)

Context provider in `real` mode:

- Default: direct shadcn registry adapter using `https://ui.shadcn.com/r/{name}.json`.
- Optional override template: `SHADCN_REGISTRY_URL_TEMPLATE`.
- Optional HTTP adapter override: set `MCP_ENDPOINT` (and optional `MCP_API_KEY`) to use an external context service.

## Verification

```bash
pnpm build
pnpm test
pnpm typecheck
```

## Documentation

- [Architecture](./docs/architecture.md)
- [API Contract](./docs/api.md)
