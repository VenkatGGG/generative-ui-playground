# Architecture

## Request Lifecycle

1. Client sends `threadId`, `prompt`, `baseVersionId` to `POST /api/generate`.
2. Orchestrator loads base version from persistence.
3. Pass 1 extracts component names.
4. MCP adapter fetches context only for those components.
5. Pass 2 streams desired end-state JSON snapshots.
6. Backend normalizes + validates each candidate.
7. Backend computes RFC6902 patches from canonical -> candidate.
8. Backend streams SSE JSONL patch/status events.
9. Client applies patches incrementally to local spec.
10. Final version/messages/logs are persisted and `done` event is emitted.
11. Failed generations emit `error` events and are logged with `generationLogs.errorCode`.

## Core Guarantees

- Backend is the source of truth for patch math.
- Client never trusts model patch generation.
- Registry is strict and unknown types fall back safely.
- Error boundaries isolate rendering crashes.
- Iterative refinement uses version lineage, not mutable state rewrites.
- Failure paths are logged for analytics without mutating successful version lineage.

## Module Responsibilities

### `@repo/contracts`
Type definitions + zod validation for requests/events/specs.

### `@repo/spec-engine`
`normalizeTreeToSpec`, `validateSpec`, `diffSpecs`, `applySpecPatches`.

### `@repo/orchestrator`
Two-pass generation flow and event emission.

### `@repo/integrations`
Adapter interfaces and stub implementations (model + MCP).

### `@repo/persistence`
Persistence interface and in-memory adapter.

### `@repo/client-core`
SSE parser and reducer for patch-driven client state.

### `@repo/renderer-react`
Recursive renderer, strict component registry, render error boundaries.
