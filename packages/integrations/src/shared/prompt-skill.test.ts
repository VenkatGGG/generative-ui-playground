import { describe, expect, it } from "vitest";
import {
  buildPass2ContractBlock,
  buildPromptSkillSection,
  buildRetryPromptWithValidationFeedback,
  detectPromptPack,
  estimatePromptPackMinElements,
  extractStyleTokens
} from "./prompt-skill";

describe("prompt skill layer", () => {
  it("detects prompt packs by intent keywords", () => {
    expect(detectPromptPack("Create a pricing card with $29/mo and CTA")).toBe("pricing-card");
    expect(detectPromptPack("Build a dashboard with metrics and charts")).toBe("dashboard");
    expect(detectPromptPack("Create a login form with email and password")).toBe("form");
    expect(detectPromptPack("Make a landing hero section")).toBe("hero");
    expect(detectPromptPack("show text")).toBe("generic");
  });

  it("extracts style tokens and builds packed section", () => {
    const tokens = extractStyleTokens("Clean modern blue layout with spacious padding and primary CTA");
    expect(tokens.colors).toContain("blue");
    expect(tokens.aesthetics).toContain("clean");

    const section = buildPromptSkillSection({
      prompt: "Create pricing card in blue with clean modern spacing",
      isV2: true
    });

    expect(section).toContain("PROMPT PACK: pricing-card");
    expect(section).toContain("GOOD_EXAMPLE_1");
    expect(section).toContain("BAD_EXAMPLE_REJECT");
    expect(section).toContain("ANTI-SKELETON");
  });

  it("builds retry prompt with validation feedback and contract blocks", () => {
    const retryPrompt = buildRetryPromptWithValidationFeedback(
      "Create a pricing card",
      [{ code: "V2_INVALID_VISIBLE_EXPRESSION", message: "Invalid visible expression" }],
      2
    );
    expect(retryPrompt).toContain("Retry attempt 2");
    expect(retryPrompt).toContain("V2_INVALID_VISIBLE_EXPRESSION");

    expect(buildPass2ContractBlock(false)).toContain("UIComponentNode");
    expect(buildPass2ContractBlock(true)).toContain("UIComponentNodeV2");
  });

  it("returns pack-specific anti-skeleton floors", () => {
    const floorV1 = estimatePromptPackMinElements(
      {
        prompt: "Create a pricing card",
        previousSpec: null,
        componentContext: { contextVersion: "ctx", componentRules: [] }
      },
      false
    );
    const floorV2 = estimatePromptPackMinElements(
      {
        prompt: "Create a pricing card",
        previousSpec: null,
        componentContext: { contextVersion: "ctx", componentRules: [] }
      },
      true
    );

    expect(floorV1).toBeGreaterThan(0);
    expect(floorV2).toBeGreaterThan(floorV1);
  });
});
