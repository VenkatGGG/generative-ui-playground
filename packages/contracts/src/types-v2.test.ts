import { describe, expectTypeOf, it } from "vitest";
import type {
  ActionBindingV2,
  BuiltInActionNameV2,
  DynamicValueExprV2,
  StreamEventV2,
  UISpecElementV2,
  UISpecV2,
  VisibilityConditionV2
} from "./types-v2";

describe("v2 type contracts", () => {
  it("keeps built-in action names constrained", () => {
    expectTypeOf<BuiltInActionNameV2>().toEqualTypeOf<
      "setState" | "pushState" | "removeState" | "validateForm"
    >();
  });

  it("models visibility conditions and dynamic expressions", () => {
    const visibility: VisibilityConditionV2 = [
      { $state: "/flags/enabled", eq: true },
      { $item: "published", neq: false },
      { $index: true, lt: 3 }
    ];
    const dynamicValue: DynamicValueExprV2 = {
      $cond: { $state: "/flags/enabled", eq: true },
      $then: { $bindState: "/form/title" },
      $else: { $item: "fallback", default: "Untitled" }
    };

    expectTypeOf(visibility).toMatchTypeOf<VisibilityConditionV2>();
    expectTypeOf(dynamicValue).toMatchTypeOf<DynamicValueExprV2>();
  });

  it("defines semantic spec and event contracts for v2", () => {
    const action: ActionBindingV2 = {
      action: "setState",
      params: { path: "/form/title", value: "Updated" }
    };
    const element: UISpecElementV2 = {
      type: "Button",
      props: { variant: "default" },
      children: ["cta"],
      slots: { leading: ["icon"] }
    };
    const spec: UISpecV2 = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: {},
          children: [],
          on: { press: action }
        }
      },
      state: { form: { title: "Updated" } }
    };
    const event: StreamEventV2 = {
      type: "usage",
      generationId: "g1",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15
    };

    expectTypeOf(action).toMatchTypeOf<ActionBindingV2>();
    expectTypeOf(element).toMatchTypeOf<UISpecElementV2>();
    expectTypeOf(spec).toMatchTypeOf<UISpecV2>();
    expectTypeOf(event).toMatchTypeOf<StreamEventV2>();
  });
});
