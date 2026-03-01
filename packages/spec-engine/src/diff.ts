import { compare } from "fast-json-patch";
import type { JsonPatch } from "@repo/contracts";

export function diffSpecs<TSpec extends object>(previous: TSpec, next: TSpec): JsonPatch[] {
  const patches = compare(previous, next) as JsonPatch[];

  // Keep deterministic ordering: path first, operation second.
  return patches.sort((a, b) => {
    if (a.path === b.path) {
      return a.op.localeCompare(b.op);
    }
    return a.path.localeCompare(b.path);
  });
}
