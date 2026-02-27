# Generative UI Playground

React-only generative UI platform implemented as a pnpm + Turbo monorepo.

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

## Verification

```bash
pnpm build
pnpm test
pnpm typecheck
```

## Documentation

- [Architecture](./docs/architecture.md)
- [API Contract](./docs/api.md)
