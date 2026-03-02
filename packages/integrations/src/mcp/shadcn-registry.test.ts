import { describe, expect, it, vi } from "vitest";
import { createShadcnRegistryAdapter } from "./shadcn-registry";

describe("createShadcnRegistryAdapter", () => {
  it("uses the default shadcn item template and maps registry items to requested components", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.endsWith("/styles/new-york/card.json")) {
        return new Response(
          JSON.stringify({
            name: "card",
            type: "registry:ui",
            description: "Displays content in a card container.",
            dependencies: ["class-variance-authority"],
            files: [
              {
                path: "card.tsx",
                content:
                  "const variants = cva('', { variants: { variant: { default: '', outline: '' }, size: { sm: '', lg: '' } }, defaultVariants: { variant: 'default', size: 'sm' } })"
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (url.endsWith("/styles/new-york/button.json")) {
        return new Response(
          JSON.stringify({
            name: "button",
            description: "Trigger actions.",
            files: [{ path: "button.tsx", content: "export const Button = () => null;" }]
          }),
          { status: 200 }
        );
      }

      return new Response("not found", { status: 404 });
    });

    const adapter = createShadcnRegistryAdapter({ fetchImpl });

    const context = await adapter.fetchContext(["Card", "CardHeader", "Button", "Text"]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ui.shadcn.com/r/styles/new-york/card.json",
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ui.shadcn.com/r/styles/new-york/button.json",
      expect.objectContaining({ method: "GET" })
    );
    expect(context.contextVersion).toBe("shadcn-registry-v1");
    expect(context.componentRules).toHaveLength(4);

    const cardRule = context.componentRules.find((rule) => rule.name === "Card");
    const cardHeaderRule = context.componentRules.find((rule) => rule.name === "CardHeader");
    const buttonRule = context.componentRules.find((rule) => rule.name === "Button");
    const textRule = context.componentRules.find((rule) => rule.name === "Text");

    expect(cardRule?.notes).toContain("Registry item: card");
    expect(cardHeaderRule?.notes).toContain("Registry item: card");
    expect(buttonRule?.notes).toContain("Registry item: button");
    expect(textRule?.notes).toContain("No direct shadcn registry item");
    expect(cardRule?.compositionRules.length).toBeGreaterThan(0);

    expect(cardRule?.variants).toContain("variant:default");
    expect(cardRule?.variants).toContain("size:sm");
  });

  it("falls back to note-only rules when registry item fetch fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("not found", { status: 404 }));

    const adapter = createShadcnRegistryAdapter({ fetchImpl });

    const context = await adapter.fetchContext(["Badge"]);

    expect(context.componentRules).toEqual([
      {
        name: "Badge",
        allowedProps: ["className", "variant"],
        variants: ["default", "secondary", "outline", "destructive"],
        compositionRules: [],
        supportedEvents: [],
        bindingHints: [
          "Use {\"$state\":\"/path\"}, {\"$item\":\"field\"}, or {\"$index\":true} for dynamic content."
        ],
        notes: "Registry item unavailable; follow catalog contract for this component."
      }
    ]);
  });
});
