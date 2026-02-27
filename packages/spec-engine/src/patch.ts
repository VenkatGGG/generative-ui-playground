import { applyPatch } from "fast-json-patch";
import type { JsonPatch, UISpec } from "@repo/contracts";

export function applySpecPatches(spec: UISpec, patches: JsonPatch[]): UISpec {
  const clone = structuredClone(spec);
  const result = applyPatch(clone, patches as any, true, false);
  return result.newDocument as UISpec;
}
