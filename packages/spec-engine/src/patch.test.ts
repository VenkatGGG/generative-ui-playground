import { describe, expect, it } from "vitest";
import { applySpecPatches } from "./patch";

describe("applySpecPatches", () => {
  it("applies add patch", () => {
    const next = applySpecPatches(
      {
        root: "root",
        elements: {
          root: { type: "Card", props: {}, children: [] }
        }
      },
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
