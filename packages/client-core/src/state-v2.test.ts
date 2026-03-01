import { describe, expect, it } from "vitest";
import { generationReducerV2, initialGenerationStateV2 } from "./state-v2";

describe("generationReducerV2", () => {
  it("applies patch events and tracks usage metadata", () => {
    const afterStatus = generationReducerV2(initialGenerationStateV2, {
      type: "status",
      generationId: "g1",
      stage: "pass2_stream_design"
    });

    const afterPatch = generationReducerV2(afterStatus, {
      type: "patch",
      generationId: "g1",
      patch: {
        op: "add",
        path: "/elements/root",
        value: {
          type: "Card",
          props: {},
          children: []
        }
      }
    });

    const afterUsage = generationReducerV2(afterPatch, {
      type: "usage",
      generationId: "g1",
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140
    });

    expect(afterPatch.spec?.elements.root).toBeDefined();
    expect(afterUsage.usage?.totalTokens).toBe(140);
  });
});
