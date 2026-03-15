import { describe, expectTypeOf, it } from "vitest";
import type {
  GenerateRequest,
  JsonPatch,
  JsonPatchOp,
  MessageRecord,
  StreamEvent,
  ThreadBundle,
  UIComponentNode,
  UISpec
} from "./types";

describe("v1 type contracts", () => {
  it("keeps json patch operations and shape constrained", () => {
    expectTypeOf<JsonPatchOp>().toEqualTypeOf<"add" | "remove" | "replace" | "move" | "copy" | "test">();
    const patch: JsonPatch = {
      op: "replace",
      path: "/elements/root/type",
      value: "Card"
    };
    expectTypeOf(patch).toMatchTypeOf<JsonPatch>();
  });

  it("defines request and stream event contracts", () => {
    const request: GenerateRequest = {
      threadId: "t1",
      prompt: "Build a pricing card",
      baseVersionId: null
    };
    const event: StreamEvent = {
      type: "patch",
      generationId: "g1",
      patch: {
        op: "add",
        path: "/elements/root",
        value: { type: "Card", props: {}, children: [] }
      }
    };

    expectTypeOf(request).toMatchTypeOf<GenerateRequest>();
    expectTypeOf(event).toMatchTypeOf<StreamEvent>();
  });

  it("defines persistent thread and ui structures", () => {
    const node: UIComponentNode = {
      id: "root",
      type: "Card",
      children: ["Hello"]
    };
    const spec: UISpec = {
      root: "root",
      elements: {
        root: { type: "Card", props: {}, children: [] }
      }
    };
    const message: MessageRecord = {
      id: "m1",
      threadId: "t1",
      generationId: "g1",
      role: "assistant",
      content: "{\"id\":\"root\",\"type\":\"Card\"}",
      reasoning: "Generated a card.",
      createdAt: "2026-03-15T00:00:00.000Z"
    };
    const bundle: ThreadBundle = {
      thread: {
        threadId: "t1",
        title: "Studio Session",
        activeVersionId: "v1",
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z"
      },
      messages: [message],
      versions: [
        {
          versionId: "v1",
          threadId: "t1",
          baseVersionId: null,
          specSnapshot: spec,
          specHash: "hash",
          mcpContextUsed: [],
          createdAt: "2026-03-15T00:00:00.000Z"
        }
      ]
    };

    expectTypeOf(node).toMatchTypeOf<UIComponentNode>();
    expectTypeOf(spec).toMatchTypeOf<UISpec>();
    expectTypeOf(message).toMatchTypeOf<MessageRecord>();
    expectTypeOf(bundle).toMatchTypeOf<ThreadBundle>();
  });
});
