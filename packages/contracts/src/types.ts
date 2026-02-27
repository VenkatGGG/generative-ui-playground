export type JsonPatchOp = "add" | "remove" | "replace" | "move" | "copy" | "test";

export interface JsonPatch {
  op: JsonPatchOp;
  path: string;
  from?: string;
  value?: unknown;
}

export interface UIComponentNode {
  id: string;
  type: string;
  props?: {
    className?: string;
    variant?: string;
    size?: string;
    [key: string]: unknown;
  };
  children?: Array<UIComponentNode | string>;
}

export interface UISpecElement {
  type: string;
  props: Record<string, unknown>;
  children: string[];
  visible?: unknown;
  on?: Record<string, { action: string; params?: Record<string, unknown> }>;
}

export interface UISpec {
  root: string;
  elements: Record<string, UISpecElement>;
  state?: Record<string, unknown>;
}

export interface GenerateRequest {
  threadId: string;
  prompt: string;
  baseVersionId: string | null;
}

export type StreamEvent =
  | { type: "status"; generationId: string; stage: string }
  | { type: "patch"; generationId: string; patch: JsonPatch }
  | { type: "warning"; generationId: string; code: string; message: string }
  | { type: "done"; generationId: string; versionId: string; specHash: string }
  | { type: "error"; generationId: string; code: string; message: string };

export interface CreateThreadRequest {
  title?: string;
}

export interface RevertRequest {
  versionId: string;
}

export interface ThreadRecord {
  threadId: string;
  title: string;
  activeVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  threadId: string;
  generationId: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface VersionRecord {
  versionId: string;
  threadId: string;
  baseVersionId: string | null;
  specSnapshot: UISpec;
  specHash: string;
  mcpContextUsed: string[];
  createdAt: string;
}

export interface GenerationLogRecord {
  id: string;
  generationId: string;
  threadId: string;
  warningCount: number;
  patchCount: number;
  durationMs: number;
  errorCode?: string;
  createdAt: string;
}

export interface ThreadBundle {
  thread: ThreadRecord;
  messages: MessageRecord[];
  versions: VersionRecord[];
}
