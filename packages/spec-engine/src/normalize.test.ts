import { describe, expect, it } from "vitest";
import { normalizeTreeToSpec } from "./normalize";

describe("normalizeTreeToSpec", () => {
  it("converts nested nodes into normalized spec", () => {
    const spec = normalizeTreeToSpec({
      id: "root",
      type: "Card",
      children: [{ id: "title", type: "Text", children: ["Pro Plan"] }]
    });

    expect(spec.root).toBe("root");
    expect(spec.elements.root!.children).toContain("title");
  });

  it("converts text children into text elements", () => {
    const spec = normalizeTreeToSpec({
      id: "root",
      type: "Card",
      children: ["hello"]
    });

    expect(spec.elements.root!.children).toHaveLength(1);
    const textId = spec.elements.root!.children[0]!;
    expect(spec.elements[textId]?.props.text).toBe("hello");
  });
});
