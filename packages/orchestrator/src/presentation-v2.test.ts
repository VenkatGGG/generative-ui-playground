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

  it("adds pack-aware layout defaults and sensible form placeholders", () => {
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
          children: ["titleContainer", "description"]
        },
        titleContainer: {
          type: "Stack",
          props: {},
          children: ["title", "badge"]
        },
        title: {
          type: "CardTitle",
          props: {},
          children: ["title__text_0"]
        },
        title__text_0: {
          type: "Text",
          props: { text: "Revenue Overview" },
          children: []
        },
        badge: {
          type: "Badge",
          props: {},
          children: ["badge__text_0"]
        },
        badge__text_0: {
          type: "Text",
          props: { text: "+12%" },
          children: []
        },
        description: {
          type: "CardDescription",
          props: {},
          children: ["description__text_0"]
        },
        description__text_0: {
          type: "Text",
          props: { text: "This month" },
          children: []
        },
        content: {
          type: "CardContent",
          props: {},
          children: ["kpiList", "email", "message"]
        },
        kpiList: {
          type: "Stack",
          props: {},
          children: ["kpiMrr"]
        },
        kpiMrr: {
          type: "Stack",
          props: {},
          children: ["label", "value"]
        },
        label: {
          type: "Text",
          props: { text: "MRR" },
          children: []
        },
        value: {
          type: "Text",
          props: { text: "$42,000" },
          children: []
        },
        email: {
          type: "Input",
          props: {},
          children: []
        },
        message: {
          type: "Textarea",
          props: {},
          children: []
        },
        footer: {
          type: "CardFooter",
          props: {},
          children: ["exportBtn", "detailsBtn"]
        },
        exportBtn: {
          type: "Button",
          props: {},
          children: ["exportBtn__text_0"]
        },
        exportBtn__text_0: {
          type: "Text",
          props: { text: "Export" },
          children: []
        },
        detailsBtn: {
          type: "Button",
          props: {},
          children: ["detailsBtn__text_0"]
        },
        detailsBtn__text_0: {
          type: "Text",
          props: { text: "View Details" },
          children: []
        }
      }
    };

    const result = applyPresentationDefaultsV2(
      spec,
      "Create a compact analytics dashboard card with blue accents and a contact capture field."
    );
    const titleContainer = result.spec.elements.titleContainer!;
    const kpiList = result.spec.elements.kpiList!;
    const kpiMrr = result.spec.elements.kpiMrr!;
    const email = result.spec.elements.email!;
    const message = result.spec.elements.message!;
    const exportBtn = result.spec.elements.exportBtn!;
    const detailsBtn = result.spec.elements.detailsBtn!;

    expect(titleContainer.props.direction).toBe("horizontal");
    expect(titleContainer.props.className).toContain("justify-between");
    expect(kpiList.props.className).toContain("gap-3");
    expect(kpiMrr.props.direction).toBe("horizontal");
    expect(kpiMrr.props.className).toContain("rounded-lg");
    expect(email.props.placeholder).toBe("you@company.com");
    expect(message.props.placeholder).toBe("Tell us a bit about your project...");
    expect(exportBtn.props.variant).toBe("default");
    expect(exportBtn.props.className).toContain("bg-blue-600");
    expect(detailsBtn.props.variant).toBe("outline");
  });
});
