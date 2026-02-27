import { compare } from "fast-json-patch";
import type { JsonPatch, UISpec } from "@repo/contracts";

export function diffSpecs(previous: UISpec, next: UISpec): JsonPatch[] {
  const patches = compare(previous, next) as JsonPatch[];

  // Keep deterministic ordering: path first, operation second.
  return patches.sort((a, b) => {
    if (a.path === b.path) {
      return a.op.localeCompare(b.op);
    }
    return a.path.localeCompare(b.path);
  });
}
