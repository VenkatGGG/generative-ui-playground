import { describe, expect, it } from "vitest";
import {
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
          props: { text: { $item: "label" } },
          children: []
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
