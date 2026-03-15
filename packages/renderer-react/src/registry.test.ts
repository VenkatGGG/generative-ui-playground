import { describe, expect, it } from "vitest";
import { createStrictRegistry, createStrictRegistryV2, hasComponent } from "./registry";

describe("registry helpers", () => {
  it("creates a frozen registry copy for legacy renderers", () => {
    const original = {
      Card: () => null
    };

    const registry = createStrictRegistry(original);

    expect(registry).not.toBe(original);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(hasComponent(registry, "Card")).toBe(true);
    expect(hasComponent(registry, "Button")).toBe(false);
  });

  it("creates a frozen registry copy for v2 renderers", () => {
    const original = {
      Card: () => null,
      Text: () => null
    };

    const registry = createStrictRegistryV2(original);

    expect(registry).not.toBe(original);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(registry.Card).toBe(original.Card);
    expect(registry.Text).toBe(original.Text);
  });
});
