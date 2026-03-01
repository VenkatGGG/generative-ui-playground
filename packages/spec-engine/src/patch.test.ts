import { describe, expect, it } from "vitest";
import type { UISpec } from "@repo/contracts";
import { applySpecPatches } from "./patch";

describe("applySpecPatches", () => {
  it("applies add patch", () => {
    const base: UISpec = {
      root: "root",
      elements: {
        root: { type: "Card", props: {}, children: [] }
      }
    };

    const next = applySpecPatches(
      base,
      [
        {
          op: "add",
          path: "/elements/title",
          value: { type: "Text", props: { text: "hello" }, children: [] }
        }
      ]
    );

    expect(next.elements.title).toBeDefined();
  });
});
