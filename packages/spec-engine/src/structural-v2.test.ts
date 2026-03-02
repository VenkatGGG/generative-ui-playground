import { describe, expect, it } from "vitest";
import type { UISpecV2 } from "@repo/contracts";
import { autoFixStructuralSpecV2, validateStructuralSpecV2 } from "./structural-v2";

function buildSpec(): UISpecV2 {
  return {
    root: "root",
    elements: {
      root: {
        type: "Card",
        props: {},
        children: ["content"]
      },
      content: {
        type: "CardContent",
        props: {
          visible: { $state: "/show", eq: true },
          on: { press: { action: "setState", params: { path: "/show", value: true } } }
        },
        children: []
      }
    },
    state: {
      show: false
    }
  };
}

describe("structural-v2", () => {
  it("flags structural placement issues", () => {
    const result = validateStructuralSpecV2(buildSpec());
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "V2_STRUCT_VISIBLE_IN_PROPS")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "V2_STRUCT_ON_IN_PROPS")).toBe(true);
  });

  it("autofixes semantic fields misplaced in props", () => {
    const fixed = autoFixStructuralSpecV2(buildSpec());
    const content = fixed.spec.elements.content;
    expect(content?.visible).toEqual({ $state: "/show", eq: true });
    expect(content?.on).toBeDefined();
    expect(content?.props.visible).toBeUndefined();
    expect(content?.props.on).toBeUndefined();
    expect(fixed.fixes.length).toBeGreaterThan(0);
  });

  it("detects missing slot children", () => {
    const spec: UISpecV2 = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: {},
          children: [],
          slots: {
            footer: ["missing"]
          }
        }
      }
    };

    const result = validateStructuralSpecV2(spec);
    expect(result.issues.some((issue) => issue.code === "V2_STRUCT_MISSING_SLOT_CHILD")).toBe(true);
  });
});
