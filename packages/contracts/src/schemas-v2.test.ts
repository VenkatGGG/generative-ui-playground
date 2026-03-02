import { describe, expect, it } from "vitest";
import {
  DynamicValueExprV2Schema,
  GenerateRequestV2Schema,
  StreamEventV2Schema,
  UITreeSnapshotV2Schema,
  UISpecV2Schema,
  VisibilityConditionV2Schema
} from "./schemas-v2";

describe("contracts schemas v2", () => {
  it("validates v2 generate request", () => {
    const parsed = GenerateRequestV2Schema.parse({
      threadId: "t1",
      prompt: "build a pricing card",
      baseVersionId: null
    });

    expect(parsed.threadId).toBe("t1");
  });

  it("validates v2 stream usage event", () => {
    const parsed = StreamEventV2Schema.parse({
      type: "usage",
      generationId: "g1",
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      model: "gemini-3.1-pro"
    });

    expect(parsed.type).toBe("usage");
  });

  it("validates visibility condition expressions", () => {
    const parsed = VisibilityConditionV2Schema.parse({
      $and: [{ $state: "/form/isValid", eq: true }, { $state: "/itemsCount", gt: 0 }]
    });

    expect(parsed).toBeTruthy();
  });

  it("rejects invalid visibility comparator combinations", () => {
    const result = VisibilityConditionV2Schema.safeParse({
      $state: "/form/isValid",
      eq: true,
      gt: 0
    });

    expect(result.success).toBe(false);
  });

  it("supports visibility with $item, $index, and implicit AND arrays", () => {
    const parsed = VisibilityConditionV2Schema.parse([
      { $item: "enabled", eq: true },
      { $index: true, lt: 3 }
    ]);

    expect(Array.isArray(parsed)).toBe(true);
  });

  it("supports conditional dynamic expressions", () => {
    const parsed = DynamicValueExprV2Schema.parse({
      $cond: { $state: "/flags/highlight", eq: true },
      $then: "primary",
      $else: "secondary"
    });

    expect(parsed).toBeTruthy();
  });

  it("validates semantic fields in v2 spec", () => {
    const parsed = UISpecV2Schema.parse({
      root: "root",
      state: {
        todos: [{ id: "1", label: "Ship v2" }],
        form: { title: "hello", accepted: false }
      },
      elements: {
        root: {
          type: "Card",
          props: {},
          children: ["list"],
          slots: {
            actions: ["submit"]
          },
          visible: { $state: "/form/accepted", neq: true }
        },
        list: {
          type: "Stack",
          props: {
            direction: "vertical"
          },
          children: ["row"],
          repeat: { statePath: "/todos", key: "id" },
          on: {
            press: {
              action: "setState",
              params: { path: "/form/title", value: { $item: "label" } }
            }
          },
          watch: {
            "/form/title": [
              { action: "validateForm", params: { path: "/form" } }
            ]
          }
        },
        row: {
          type: "Text",
          props: {
            text: {
              $cond: [{ $item: "label", neq: "" }],
              $then: { $item: "label" },
              $else: "Untitled"
            }
          },
          children: []
        },
        submit: {
          type: "Button",
          props: {
            variant: {
              $cond: { $state: "/form/accepted", eq: true },
              $then: "default",
              $else: "secondary"
            }
          },
          children: ["Submit"]
        }
      }
    });

    expect(parsed.root).toBe("root");
  });

  it("validates v2 tree snapshot schema", () => {
    const parsed = UITreeSnapshotV2Schema.parse({
      state: {
        form: { title: "Plan" }
      },
      tree: {
        id: "root",
        type: "Card",
        children: [
          {
            id: "title",
            type: "CardTitle",
            children: ["Pro Plan"]
          }
        ]
      }
    });

    expect(parsed.tree.type).toBe("Card");
  });
});
