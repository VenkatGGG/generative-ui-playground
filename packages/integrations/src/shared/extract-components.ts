import {
  ALLOWED_COMPONENT_TYPES,
  ALLOWED_COMPONENT_TYPES_V2,
  canonicalizeCatalogComponentTypeV2,
  isAllowedComponentType,
  isAllowedComponentTypeV2
} from "@repo/component-catalog";
import type { ExtractComponentsResult } from "../interfaces";

const EXPLICIT_COMPONENT_TYPES = Array.from(
  new Set([...ALLOWED_COMPONENT_TYPES, ...ALLOWED_COMPONENT_TYPES_V2])
).sort((left, right) => right.length - left.length);

function canonicalizeRequestedComponents(components: string[]): string[] {
  const normalized = components
    .map((component) => canonicalizeCatalogComponentTypeV2(component))
    .filter((component) => isAllowedComponentType(component) || isAllowedComponentTypeV2(component));

  return Array.from(new Set(normalized));
}

export function extractExplicitPromptComponents(prompt: string): string[] {
  const hits = EXPLICIT_COMPONENT_TYPES
    .map((componentType) => ({
      componentType,
      index: prompt.search(new RegExp(`\\b${componentType}\\b`, "i"))
    }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.componentType);

  return canonicalizeRequestedComponents(hits);
}

export function normalizeExtractComponentsResult(
  parsed: unknown,
  prompt?: string
): ExtractComponentsResult {
  if (!parsed || typeof parsed !== "object") {
    return {
      components: prompt ? extractExplicitPromptComponents(prompt) : [],
      intentType: "new",
      confidence: 0
    };
  }

  const record = parsed as {
    components?: unknown;
    intentType?: unknown;
    confidence?: unknown;
  };

  const parsedComponents = Array.isArray(record.components)
    ? record.components.filter((item): item is string => typeof item === "string")
    : [];
  const components = canonicalizeRequestedComponents([
    ...parsedComponents,
    ...(prompt ? extractExplicitPromptComponents(prompt) : [])
  ]);

  const intentType = record.intentType === "modify" ? "modify" : "new";
  const rawConfidence = typeof record.confidence === "number" ? record.confidence : 0;

  return {
    components,
    intentType,
    confidence: Math.max(0, Math.min(1, rawConfidence))
  };
}
