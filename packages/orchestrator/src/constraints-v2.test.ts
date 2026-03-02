import { describe, expect, it } from "vitest";
import type { UISpecV2 } from "@repo/contracts";
import { buildConstraintSetV2, validateConstraintSetV2 } from "./constraints-v2";

describe("constraints-v2", () => {
  it("flags missing card structure for card-like prompts", () => {
    const constraints = buildConstraintSetV2({
      prompt: "Create a pricing card with CTA",
      pass1: {
        components: ["Card", "CardHeader", "CardContent", "Button"],
        intentType: "new",
        confidence: 0.95
      }
    });

    const spec: UISpecV2 = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: {},
          children: ["title"]
        },
        title: {
          type: "CardTitle",
          props: {},
          children: []
        }
      }
    };

    const violations = validateConstraintSetV2(spec, constraints);
    const codes = violations.map((violation) => violation.code);

    expect(codes).toContain("V2_CARD_STRUCTURE_MISSING");
    expect(codes).toContain("V2_REQUIRED_COMPONENT_MISSING");
  });

  it("flags missing form controls for form-like prompts", () => {
    const constraints = buildConstraintSetV2({
      prompt: "Build a signup form with submit button",
      pass1: {
        components: ["Card", "Button"],
        intentType: "new",
        confidence: 0.9
      }
    });

    const spec: UISpecV2 = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: {},
          children: ["content"]
        },
        content: {
          type: "CardContent",
          props: {},
          children: ["submit"]
        },
        submit: {
          type: "Button",
          props: {},
          children: []
        }
      }
    };

    const violations = validateConstraintSetV2(spec, constraints);
    expect(violations.some((violation) => violation.message.includes("Form-like prompts"))).toBe(true);
  });

  it("accepts rich card and form structure", () => {
    const constraints = buildConstraintSetV2({
      prompt: "Build a signup card with inputs and submit button",
      pass1: {
        components: ["Card", "CardHeader", "CardContent", "Input", "Button"],
        intentType: "new",
        confidence: 0.94
      }
    });

    const spec: UISpecV2 = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: {},
          children: ["header", "content"]
        },
        header: {
          type: "CardHeader",
          props: {},
          children: ["title"]
        },
        title: {
          type: "CardTitle",
          props: {},
          children: []
        },
        content: {
          type: "CardContent",
          props: {},
          children: ["email", "submit"]
        },
        email: {
          type: "Input",
          props: {},
          children: []
        },
        submit: {
          type: "Button",
          props: {},
          children: []
        }
      }
    };

    const violations = validateConstraintSetV2(spec, constraints);
    expect(violations).toEqual([]);
  });
});
