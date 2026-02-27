import { describe, expect, it } from "vitest";
import { validateSpec } from "./validate";

describe("validateSpec", () => {
  it("accepts valid spec", () => {
    const result = validateSpec({
      root: "root",
      elements: {
        root: { type: "Card", props: {}, children: ["child"] },
        child: { type: "Text", props: { text: "hello" }, children: [] }
      }
    });

    expect(result.valid).toBe(true);
  });

  it("rejects missing child references", () => {
    const result = validateSpec({
      root: "root",
      elements: {
        root: { type: "Card", props: {}, children: ["missing"] }
      }
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "MISSING_CHILD_ELEMENT")).toBe(true);
  });

  it("rejects unknown component when allowlist exists", () => {
    const result = validateSpec(
      {
        root: "root",
        elements: {
          root: { type: "NotAllowed", props: {}, children: [] }
        }
      },
      {
        allowedComponentTypes: new Set(["Card"]) 
      }
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "UNKNOWN_COMPONENT")).toBe(true);
  });
});
