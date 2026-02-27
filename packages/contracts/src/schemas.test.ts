import { describe, expect, it } from "vitest";
import {
  GenerateRequestSchema,
  StreamEventSchema,
  UIComponentNodeSchema,
  UISpecSchema
} from "./schemas";

describe("contracts schemas", () => {
  it("validates generate request", () => {
    const parsed = GenerateRequestSchema.parse({
      threadId: "t1",
      prompt: "build a pricing card",
      baseVersionId: null
    });

    expect(parsed.threadId).toBe("t1");
  });

  it("validates component node recursion", () => {
    const node = UIComponentNodeSchema.parse({
      id: "root",
      type: "Card",
      children: [{ id: "c1", type: "Text", children: ["hello"] }]
    });

    expect(node.children).toHaveLength(1);
  });

  it("validates stream events", () => {
    const event = StreamEventSchema.parse({
      type: "status",
      generationId: "g1",
      stage: "pass1"
    });

    expect(event.type).toBe("status");
  });

  it("validates UI specs", () => {
    const spec = UISpecSchema.parse({
      root: "root",
      elements: {
        root: { type: "Card", props: {}, children: [] }
      }
    });

    expect(spec.root).toBe("root");
  });
});
