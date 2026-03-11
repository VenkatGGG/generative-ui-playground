import { describe, expect, it } from "vitest";
import {
  extractExplicitPromptComponents,
  normalizeExtractComponentsResult
} from "./extract-components";

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

  it("merges explicit component mentions from the prompt", () => {
    const result = normalizeExtractComponentsResult(
      {
        components: ["Card", "Button"]
      },
      'Create a UI using CardHeader, CardContent, CardFooter, and Button'
    );

    expect(result.components).toEqual(["Card", "Button", "CardHeader", "CardContent", "CardFooter"]);
  });

  it("extracts explicit component names directly from prompt text", () => {
    const components = extractExplicitPromptComponents("Use CardHeader, CardTitle, Input and Button.");

    expect(components).toEqual(["CardHeader", "CardTitle", "Input", "Button"]);
  });

  it("drops pass1 component noise that conflicts with the detected prompt pack", () => {
    const result = normalizeExtractComponentsResult(
      {
        components: ["Card", "Button", "Input", "Textarea", "CardHeader", "CardContent"]
      },
      "Create a premium pricing card for Pro Plan with two CTA buttons"
    );

    expect(result.components).toEqual(["Card", "Button", "CardHeader", "CardContent"]);
  });
});
