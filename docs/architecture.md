# Architecture

## Versioning

- `v1`: original tree+diff pipeline and static recursive rendering.
- `v2`: versioned parity runtime with semantic contracts and `/api/v2/*` routes.

## Request Lifecycle

1. Client sends `threadId`, `prompt`, `baseVersionId` to `POST /api/generate`.
2. Orchestrator loads base version from persistence.
3. Pass 1 extracts component names.
4. MCP adapter fetches context only for those components.
5. Pass 2 requests one structured JSON snapshot per attempt (`{ state?: object, tree: UIComponentNodeV2 }` in v2).
6. Backend normalizes + validates each candidate.
7. Backend computes RFC6902 patches from canonical -> candidate.
8. Backend streams SSE JSONL patch/status events.
9. Client applies patches incrementally to local spec.
10. Final version/messages/logs are persisted and `done` event is emitted.
11. Failed generations emit `error` events and are logged with `generationLogs.errorCode`.

## v2 Semantic Runtime

`v2` adds runtime semantics in renderer/client/spec-engine:

- Dynamic expressions: `$state`, `$item`, `$index`, `$bindState`, `$bindItem`
- Conditional rendering: `visible` (boolean, comparator, `$and`, `$or`, `not`)
- Array iteration: `repeat` with `statePath`
- Action system:
  - `on` event handlers (`press`, `change`, `submit`)
  - `watch` state-path triggers
  - Built-in actions: `setState`, `pushState`, `removeState`, `validateForm`
- v2 stream events add `usage` token metadata
- Persistence stores version lineage with `schemaVersion: "v2"` for v2 versions

## Core Guarantees

- Backend is the source of truth for patch math.
- Client never trusts model patch generation.
- v2 pass2 prompt/schema contract is single-snapshot aligned (no NDJSON contract).
- Registry is strict and unknown types fall back safely.
- Error boundaries isolate rendering crashes.
- Iterative refinement uses version lineage, not mutable state rewrites.
- Failure paths are logged for analytics without mutating successful version lineage.
- Generation logs persist timing via `durationMs` alongside warning/patch/error metadata.

## Real-Mode Quality Controls

- Gemini pass2 output budget and thinking level are configurable:
  - `GEMINI_PASS2_MAX_OUTPUT_TOKENS` (default `2048`)
  - `GEMINI_PASS2_THINKING_LEVEL` (default `LOW`)
- Direct shadcn registry default template:
  - `https://ui.shadcn.com/r/styles/new-york/{name}.json`
- On registry misses, MCP context injects concise fallback guidance only (not raw HTTP transport errors).

## Sparse Output Handling

- Structural validators reject semantically thin but syntactically valid candidates.
- Warnings include deterministic codes such as:
  - `V2_CARD_STRUCTURE_MISSING`
  - `V2_REQUIRED_COMPONENT_MISSING`
  - `V2_NO_STRUCTURAL_PROGRESS`
- If retries exhaust, orchestrator emits `FALLBACK_APPLIED` and persists deterministic fallback output.

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
