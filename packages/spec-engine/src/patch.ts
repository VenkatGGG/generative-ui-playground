import { applyPatch } from "fast-json-patch";
import type { JsonPatch } from "@repo/contracts";

export function applySpecPatches<TSpec extends object>(spec: TSpec, patches: JsonPatch[]): TSpec {
  const clone = structuredClone(spec);
  const result = applyPatch(clone, patches as any, true, false);
  return result.newDocument as TSpec;
}
