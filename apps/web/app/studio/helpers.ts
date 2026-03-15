import type { GenerationStateV2 } from "@repo/client-core/client";
import type { ThreadBundleV2, UISpecV2 } from "@repo/contracts";

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  meta?: Record<string, unknown>;
};

export type RevertState = {
  versionId: string | null;
  loading: boolean;
};

export function looksLikeJsonContent(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function fallbackApplied(meta: Record<string, unknown> | undefined): boolean {
  return meta?.fallbackApplied === true;
}

export function warningCount(meta: Record<string, unknown> | undefined): number | null {
  return typeof meta?.warningCount === "number" ? (meta.warningCount as number) : null;
}

export function findActiveSpec(bundle: ThreadBundleV2): UISpecV2 | null {
  const activeId = bundle.thread.activeVersionId;
  const active = bundle.versions.find((version) => version.versionId === activeId) ?? bundle.versions[0];
  return active?.specSnapshot ?? null;
}

export function statusFromState(state: GenerationStateV2): "idle" | "streaming" | "error" {
  if (state.error) {
    return "error";
  }
  if (state.isStreaming) {
    return "streaming";
  }
  return "idle";
}
