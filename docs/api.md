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

## GET `/api/threads/:threadId`
Returns full thread bundle.

## POST `/api/threads/:threadId/revert`
Reverts active spec to a previous version and creates a new lineage version.

### Request
```json
{ "versionId": "target-version-id" }
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
