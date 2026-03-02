import { describe, expect, it } from "vitest";
import {
  evaluateVisibilityV2,
  expandRepeatScopesV2,
  getValueAtStatePath,
  resolveDynamicValueV2
} from "./runtime-v2";

describe("runtime-v2", () => {
  it("resolves state and repeat expressions", () => {
    const state = {
      form: {
        title: "Hello"
      }
    };

    const resolvedState = resolveDynamicValueV2({ $state: "/form/title" }, { state });
    const resolvedItem = resolveDynamicValueV2(
      { $item: "label" },
      { state, scope: { item: { label: "Row 1" }, index: 1 } }
    );
    const resolvedIndex = resolveDynamicValueV2(
      { $index: true },
      { state, scope: { item: {}, index: 2 } }
    );

    expect(resolvedState).toBe("Hello");
    expect(resolvedItem).toBe("Row 1");
    expect(resolvedIndex).toBe(2);
  });

  it("resolves binding expressions", () => {
    const boundState = resolveDynamicValueV2({ $bindState: "/form/title" }, { state: {} });
    const boundItem = resolveDynamicValueV2({ $bindItem: "id" }, { state: {} });

    expect(boundState).toEqual({ kind: "state", path: "/form/title" });
    expect(boundItem).toEqual({ kind: "item", field: "id" });
  });

  it("evaluates visibility expressions", () => {
    const state = {
      form: { valid: true },
      count: 3
    };

    expect(evaluateVisibilityV2({ $state: "/form/valid", eq: true }, { state })).toBe(true);
    expect(evaluateVisibilityV2({ $state: "/count", gt: 0 }, { state })).toBe(true);
    expect(
      evaluateVisibilityV2(
        { $and: [{ $state: "/form/valid", eq: true }, { $state: "/count", gte: 3 }] },
        { state }
      )
    ).toBe(true);
  });

  it("treats null or malformed visibility conditions as visible (fail-open)", () => {
    const state = {
      form: { valid: true }
    };

    expect(evaluateVisibilityV2(null, { state })).toBe(true);
    expect(evaluateVisibilityV2({ $and: null } as unknown as never, { state })).toBe(true);
    expect(evaluateVisibilityV2({ $or: "bad" } as unknown as never, { state })).toBe(true);
  });

  it("expands repeat scopes from state arrays", () => {
    const scopes = expandRepeatScopesV2(
      {
        state: {
          items: [{ id: "a" }, { id: "b" }]
        }
      },
      "/items",
      "id"
    );

    expect(scopes).toHaveLength(2);
    expect(scopes[0]?.key).toBe("a");
    expect(scopes[1]?.scope.index).toBe(1);
  });

  it("reads json pointer-like state paths", () => {
    const value = getValueAtStatePath({ a: [{ name: "n1" }] }, "/a/0/name");
    expect(value).toBe("n1");
  });
});
