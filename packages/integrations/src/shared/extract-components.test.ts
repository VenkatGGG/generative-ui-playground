import { describe, expect, it } from "vitest";
import { normalizeExtractComponentsResult } from "./extract-components";

describe("normalizeExtractComponentsResult", () => {
  it("normalizes valid payload fields", () => {
    const result = normalizeExtractComponentsResult({
      components: ["Card", "Button", 123],
      intentType: "modify",
      confidence: 2
    });

    expect(result.components).toEqual(["Card", "Button"]);
    expect(result.intentType).toBe("modify");
    expect(result.confidence).toBe(1);
  });

  it("returns safe defaults for invalid payloads", () => {
    const result = normalizeExtractComponentsResult("not-json");

    expect(result.components).toEqual([]);
    expect(result.intentType).toBe("new");
    expect(result.confidence).toBe(0);
  });
});
