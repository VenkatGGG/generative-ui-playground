import { describe, expect, it } from "vitest";
import type { UISpecV2 } from "@repo/contracts";
import { applyPresentationDefaultsV2 } from "./presentation-v2";

describe("applyPresentationDefaultsV2", () => {
  it("adds presentation classes and removes redundant semantic fields", () => {
    const spec: UISpecV2 = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: {},
          children: ["header", "content", "footer"]
        },
        header: {
          type: "CardHeader",
          props: {},
          children: ["title", "description"]
        },
        title: {
          type: "CardTitle",
          props: {},
          children: ["title__text_0"]
        },
        title__text_0: {
          type: "Text",
          props: { text: "Pro Plan" },
          children: []
        },
        description: {
          type: "CardDescription",
          props: {},
          children: ["description__text_0"]
        },
        description__text_0: {
          type: "Text",
          props: { text: "For startups" },
          children: []
        },
        content: {
          type: "CardContent",
          props: {},
          children: ["price", "primary"]
        },
        price: {
          type: "Text",
          props: { text: "$29/mo" },
          children: [],
          visible: true,
          watch: {}
        },
        primary: {
          type: "Button",
          props: {},
          children: ["primary__text_0"]
        },
        primary__text_0: {
          type: "Text",
          props: { text: "Start Free Trial" },
          children: []
        },
        footer: {
          type: "CardFooter",
          props: {},
          children: ["secondary"]
        },
        secondary: {
          type: "Button",
          props: {},
          children: ["secondary__text_0"]
        },
        secondary__text_0: {
          type: "Text",
          props: { text: "View Docs" },
          children: []
        }
      }
    };

    const result = applyPresentationDefaultsV2(spec, "Create a premium pricing card with blue accents");
    const root = result.spec.elements.root!;
    const price = result.spec.elements.price!;
    const primary = result.spec.elements.primary!;
    const secondary = result.spec.elements.secondary!;

    expect(result.changed).toBe(true);
    expect(root.props.className).toContain("max-w-lg");
    expect(price.props.className).toContain("text-4xl");
    expect(primary.props.variant).toBe("default");
    expect(primary.props.className).toContain("bg-blue-600");
    expect(secondary.props.variant).toBe("outline");
    expect(secondary.props.className).toContain("min-w-[140px]");
    expect(price.visible).toBeUndefined();
    expect(price.watch).toBeUndefined();
  });

  it("preserves model-provided classes and variants while appending defaults", () => {
    const spec: UISpecV2 = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: { className: "custom-shell" },
          children: ["cta"]
        },
        cta: {
          type: "Button",
          props: { className: "w-full", variant: "secondary" },
          children: ["cta__text_0"]
        },
        cta__text_0: {
          type: "Text",
          props: { text: "Continue" },
          children: []
        }
      }
    };

    const result = applyPresentationDefaultsV2(spec, "Create a simple card");
    const root = result.spec.elements.root!;
    const cta = result.spec.elements.cta!;

    expect(root.props.className).toContain("custom-shell");
    expect(root.props.className).toContain("shadow-sm");
    expect(cta.props.className).toContain("w-full");
    expect(cta.props.className).toContain("min-w-[160px]");
    expect(cta.props.variant).toBe("secondary");
  });
});
