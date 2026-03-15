import { describe, expect, it } from "vitest";
import { buildComponentContextPromptSection } from "./component-context-prompt";

describe("buildComponentContextPromptSection", () => {
  it("renders an explicit none marker when no rules are present", () => {
    expect(
      buildComponentContextPromptSection({
        contextVersion: "ctx-v1",
        componentRules: []
      })
    ).toBe("MCP CONTEXT RULES: none.");
  });

  it("renders each component rule with semantic fields", () => {
    const prompt = buildComponentContextPromptSection({
      contextVersion: "ctx-v2",
      componentRules: [
        {
          name: "Card",
          allowedProps: ["className"],
          variants: ["default", "outline"],
          compositionRules: ["Must include CardHeader and CardContent."],
          supportedEvents: ["press"],
          bindingHints: ["Use state bindings for form values."],
          notes: "Prefer meaningful titles."
        }
      ]
    });

    expect(prompt).toContain("MCP CONTEXT RULES (ctx-v2):");
    expect(prompt).toContain("- Card:");
    expect(prompt).toContain("allowedProps [className]");
    expect(prompt).toContain("variants [default, outline]");
    expect(prompt).toContain("composition [Must include CardHeader and CardContent.]");
    expect(prompt).toContain("events [press]");
    expect(prompt).toContain("bindingHints [Use state bindings for form values.]");
    expect(prompt).toContain("notes: Prefer meaningful titles.");
  });
});
