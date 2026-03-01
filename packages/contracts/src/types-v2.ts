import type { JsonPatch } from "./types";

export type SchemaVersion = "v1" | "v2";

export type DynamicValueExprV2 =
  | { $state: string; default?: unknown }
  | { $item: string; default?: unknown }
  | { $index: true }
  | { $bindState: string }
  | { $bindItem: string };

export type VisibilityConditionV2 =
  | boolean
  | {
      $state: string;
      eq?: unknown;
      neq?: unknown;
      gt?: number;
      gte?: number;
      lt?: number;
      lte?: number;
      not?: boolean;
    }
  | { $and: VisibilityConditionV2[] }
  | { $or: VisibilityConditionV2[] };

export interface RepeatConfigV2 {
  statePath: string;
  key?: string;
}

export type BuiltInActionNameV2 = "setState" | "pushState" | "removeState" | "validateForm";

export interface ActionBindingV2 {
  action: BuiltInActionNameV2;
  params?: Record<string, unknown>;
}

export interface UISpecElementV2 {
  type: string;
  props: Record<string, unknown>;
  children: string[];
  visible?: VisibilityConditionV2;
  repeat?: RepeatConfigV2;
  on?: Record<string, ActionBindingV2 | ActionBindingV2[]>;
  watch?: Record<string, ActionBindingV2 | ActionBindingV2[]>;
}

export interface UIComponentNodeV2 {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  visible?: VisibilityConditionV2;
  repeat?: RepeatConfigV2;
  on?: Record<string, ActionBindingV2 | ActionBindingV2[]>;
  watch?: Record<string, ActionBindingV2 | ActionBindingV2[]>;
  children?: Array<UIComponentNodeV2 | string>;
}

export interface UISpecV2 {
  root: string;
  elements: Record<string, UISpecElementV2>;
  state?: Record<string, unknown>;
}

export interface UITreeSnapshotV2 {
  state?: Record<string, unknown>;
  tree: UIComponentNodeV2;
}

export interface GenerateRequestV2 {
  threadId: string;
  prompt: string;
  baseVersionId: string | null;
}

export type StreamEventV2 =
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

export interface VersionRecordV2 {
  versionId: string;
  threadId: string;
  baseVersionId: string | null;
  specSnapshot: UISpecV2;
  specHash: string;
  mcpContextUsed: string[];
  schemaVersion: "v2";
  createdAt: string;
}

export interface ThreadBundleV2 {
  thread: {
    threadId: string;
    title: string;
    activeVersionId: string;
    createdAt: string;
    updatedAt: string;
  };
  messages: Array<{
    id: string;
    threadId: string;
    generationId: string;
    role: "user" | "assistant";
    content: string;
    reasoning?: string;
    createdAt: string;
    meta?: Record<string, unknown>;
  }>;
  versions: VersionRecordV2[];
}
