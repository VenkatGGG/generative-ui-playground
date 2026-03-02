# API Contract

## POST `/api/threads`
Create a thread.

### Request
```json
{ "title": "Optional title" }
```

### Response `201`
```json
{
  "thread": {
    "threadId": "...",
    "title": "...",
    "activeVersionId": "...",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "versions": [],
  "messages": []
}
```

### Error `500`
```json
{ "error": "RUNTIME_DEPENDENCY_ERROR", "message": "..." }
```

### Error `500` (Preflight persistence/internal)
```json
{ "error": "INTERNAL_SERVER_ERROR", "message": "..." }
```

### Error `500` (Persistence/Internal)
```json
{ "error": "INTERNAL_SERVER_ERROR", "message": "..." }
```

## GET `/api/threads/:threadId`
Returns full thread bundle.

Assistant messages include:

- `content`: raw streamed model output captured during generation.
- `reasoning` (optional): human-readable generation summary persisted by orchestrator.

### Error `500`
```json
{ "error": "RUNTIME_DEPENDENCY_ERROR", "message": "..." }
```

### Error `500` (Persistence/Internal)
```json
{ "error": "INTERNAL_SERVER_ERROR", "message": "..." }
```

## POST `/api/threads/:threadId/revert`
Reverts active spec to a previous version and creates a new lineage version.

### Request
```json
{ "versionId": "target-version-id" }
```

### Error `500`
```json
{ "error": "RUNTIME_DEPENDENCY_ERROR", "message": "..." }
```

### Error `500` (Non-not-found failures)
```json
{ "error": "INTERNAL_SERVER_ERROR", "message": "..." }
```

## POST `/api/generate`
Starts generation stream.

### Request
```json
{
  "threadId": "...",
  "prompt": "...",
  "baseVersionId": "... or null"
}
```

### Response
`Content-Type: text/event-stream`

Events are sent as JSON payloads in `data:` lines.

#### Event Types
```ts
type StreamEvent =
  | { type: "status"; generationId: string; stage: string }
  | { type: "patch"; generationId: string; patch: JsonPatch }
  | { type: "warning"; generationId: string; code: string; message: string }
  | { type: "done"; generationId: string; versionId: string; specHash: string }
  | { type: "error"; generationId: string; code: string; message: string };
```

Failed generations also write a `generationLogs` entry with the terminal `errorCode`.

### Error `500`
```json
{ "error": "RUNTIME_DEPENDENCY_ERROR", "message": "..." }
```

---

## v2 Routes

`v2` routes mirror v1 shape with semantic runtime support:

- `POST /api/v2/threads`
- `GET /api/v2/threads/:threadId`
- `POST /api/v2/threads/:threadId/revert`
- `POST /api/v2/generate`

### POST `/api/v2/generate` Event Types

```ts
type StreamEventV2 =
  | { type: "status"; generationId: string; stage: string }
  | { type: "patch"; generationId: string; patch: JsonPatch }
  | { type: "warning"; generationId: string; code: string; message: string }
  | {
      type: "usage";
      generationId: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      model?: string;
    }
  | { type: "done"; generationId: string; versionId: string; specHash: string }
  | { type: "error"; generationId: string; code: string; message: string };
```

### v2 Pass2 Contract

For each model attempt, pass2 is instructed to output exactly one JSON object:

```ts
{ state?: Record<string, unknown>; tree: UIComponentNodeV2 }
```

Multiple root JSON objects in one response are invalid for v2 and can trigger retry/fallback behavior.

### v2 Warning and Error Notes

- `V2_SPARSE_OUTPUT`: candidate tree is valid JSON but too structurally thin.
- `V2_CARD_STRUCTURE_MISSING`: card intent/spec missing required card sub-structure.
- `V2_REQUIRED_COMPONENT_MISSING`: intent requires components that are absent (for example form controls).
- `V2_NO_STRUCTURAL_PROGRESS`: retries produced equivalent sparse structure.
- `PASS2_STREAM_FAILED`: upstream model stream failure (including transient provider unavailability).
- `FALLBACK_APPLIED`: retry budget exhausted; deterministic fallback output was emitted.
