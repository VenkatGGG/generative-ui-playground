import { describe, expect, it } from "vitest";
import { normalizeSnapshotToSpecV2 } from "./normalize-v2";

describe("normalizeSnapshotToSpecV2", () => {
  it("normalizes semantic node fields into v2 spec elements", () => {
    const spec = normalizeSnapshotToSpecV2({
      state: {
        items: [{ id: "1", label: "One" }]
      },
      tree: {
        id: "root",
        type: "Card",
        children: [
          {
            id: "content",
            type: "CardContent",
            repeat: {
              statePath: "/items"
            },
            visible: {
              $state: "/items",
              neq: null
            },
            children: ["Row"]
          }
        ]
      }
    });

    expect(spec.state?.items).toBeDefined();
    expect(spec.elements.content?.repeat?.statePath).toBe("/items");
    expect(spec.elements.content?.visible).toEqual({ $state: "/items", neq: null });
  });
});
