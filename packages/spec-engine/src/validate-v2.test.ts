import { describe, expect, it } from "vitest";
import type { UISpecV2 } from "@repo/contracts";
import { validateSpecV2 } from "./validate-v2";

function buildBaseSpec(overrides?: Partial<UISpecV2>): UISpecV2 {
  return {
    root: "root",
    state: {
      items: [{ id: "1", label: "One" }]
    },
    elements: {
      root: {
        type: "Card",
        props: {},
        children: ["content"]
      },
      content: {
        type: "CardContent",
        props: {},
        children: ["input", "select"],
        visible: { $state: "/items", neq: null }
      },
      input: {
        type: "Input",
        props: {
          value: { $state: "/form/title", default: "" }
        },
        children: [],
        on: {
          change: {
            action: "setState",
            params: {
              path: "/form/title",
              value: { $state: "/form/title", default: "" }
            }
          }
        }
      },
      select: {
        type: "Select",
        props: {
          options: [
            { label: "Free", value: "free" },
            { label: "Pro", value: "pro" }
          ]
        },
        children: []
      }
    },
    ...overrides
  };
}

describe("validateSpecV2", () => {
  it("accepts a valid semantic v2 spec", () => {
    const result = validateSpecV2(buildBaseSpec(), {
      allowedComponentTypes: new Set(["Card", "CardContent", "Input", "Select"])
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid repeat statePath", () => {
    const base = buildBaseSpec();
    const spec = buildBaseSpec({
      elements: {
        ...base.elements,
        content: {
          ...base.elements.content!,
          repeat: {
            statePath: "items"
          }
        }
      }
    });
    const result = validateSpecV2(spec);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "V2_INVALID_REPEAT_STATE_PATH")).toBe(true);
  });

  it("rejects non-array repeat path values", () => {
    const base = buildBaseSpec();
    const spec = buildBaseSpec({
      state: {
        items: "not-array"
      },
      elements: {
        ...base.elements,
        content: {
          ...base.elements.content!,
          repeat: {
            statePath: "/items"
          }
        }
      }
    });
    const result = validateSpecV2(spec);
    expect(result.issues.some((issue) => issue.code === "V2_REPEAT_NOT_ARRAY")).toBe(true);
  });

  it("rejects malformed dynamic expressions", () => {
    const base = buildBaseSpec();
    const spec = buildBaseSpec({
      elements: {
        ...base.elements,
        input: {
          ...base.elements.input!,
          props: {
            value: {
              $state: "/a",
              $item: "b"
            }
          }
        }
      }
    });
    const result = validateSpecV2(spec);
    expect(result.issues.some((issue) => issue.code === "V2_INVALID_DYNAMIC_EXPRESSION")).toBe(true);
  });

  it("rejects malformed visible expressions", () => {
    const base = buildBaseSpec();
    const spec = buildBaseSpec({
      elements: {
        ...base.elements,
        content: {
          ...base.elements.content!,
          visible: {
            $state: "/count",
            eq: 1,
            gt: 0
          } as never
        }
      }
    });
    const result = validateSpecV2(spec);
    expect(result.issues.some((issue) => issue.code === "V2_INVALID_VISIBLE_EXPRESSION")).toBe(true);
  });

  it("rejects invalid Select options shape", () => {
    const base = buildBaseSpec();
    const spec = buildBaseSpec({
      elements: {
        ...base.elements,
        select: {
          ...base.elements.select!,
          props: {
            options: [1, 2, 3]
          }
        }
      }
    });

    const result = validateSpecV2(spec);
    expect(result.issues.some((issue) => issue.code === "V2_INVALID_COMPONENT_PROPS")).toBe(true);
  });
});
