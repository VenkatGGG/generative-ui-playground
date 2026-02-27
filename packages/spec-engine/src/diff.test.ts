import { describe, expect, it } from "vitest";
import type { UISpec } from "@repo/contracts";
import { diffSpecs } from "./diff";
import { applySpecPatches } from "./patch";

const baseSpec: UISpec = {
  root: "root",
  elements: {
    root: { type: "Card", props: {}, children: ["title"] },
    title: { type: "Text", props: { text: "Old" }, children: [] }
  }
};

describe("diffSpecs", () => {
  it("creates deterministic patches", () => {
    const next: UISpec = {
      root: "root",
      elements: {
        root: { type: "Card", props: {}, children: ["title"] },
        title: { type: "Text", props: { text: "New" }, children: [] }
      }
    };

    const patches = diffSpecs(baseSpec, next);

    expect(patches.length).toBeGreaterThan(0);
    expect(patches[0]?.path).toContain("/elements/title/props/text");
  });

  it("roundtrips through patch apply", () => {
    const next: UISpec = {
      root: "root",
      elements: {
        root: { type: "Card", props: { className: "w-full" }, children: ["title", "cta"] },
        title: { type: "Text", props: { text: "New" }, children: [] },
        cta: { type: "Button", props: { label: "Go" }, children: [] }
      }
    };

    const patches = diffSpecs(baseSpec, next);
    const patched = applySpecPatches(baseSpec, patches);

    expect(patched).toEqual(next);
  });
});
