import type { ExtractComponentsResult } from "../interfaces";

export function normalizeExtractComponentsResult(parsed: unknown): ExtractComponentsResult {
  if (!parsed || typeof parsed !== "object") {
    return { components: [], intentType: "new", confidence: 0 };
  }

  const record = parsed as {
    components?: unknown;
    intentType?: unknown;
    confidence?: unknown;
  };

  const components = Array.isArray(record.components)
    ? record.components.filter((item): item is string => typeof item === "string")
    : [];

  const intentType = record.intentType === "modify" ? "modify" : "new";
  const rawConfidence = typeof record.confidence === "number" ? record.confidence : 0;

  return {
    components,
    intentType,
    confidence: Math.max(0, Math.min(1, rawConfidence))
  };
}
