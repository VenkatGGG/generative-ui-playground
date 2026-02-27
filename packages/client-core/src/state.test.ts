import { describe, expect, it } from "vitest";
import { generationReducer, initialGenerationState } from "./state";

describe("generationReducer", () => {
  it("applies patch events to spec", () => {
    const state1 = generationReducer(initialGenerationState, {
      type: "status",
      generationId: "g1",
      stage: "pass2"
    });

    const state2 = generationReducer(state1, {
      type: "patch",
      generationId: "g1",
      patch: { op: "add", path: "/root", value: "root" }
    });

    const state3 = generationReducer(state2, {
      type: "patch",
      generationId: "g1",
      patch: {
        op: "add",
        path: "/elements/root",
        value: { type: "Card", props: {}, children: [] }
      }
    });

    expect(state3.spec?.root).toBe("root");
    expect(state3.spec?.elements.root).toBeDefined();
  });

  it("captures error and stops stream", () => {
    const state = generationReducer(initialGenerationState, {
      type: "error",
      generationId: "g1",
      code: "FAIL",
      message: "failed"
    });

    expect(state.isStreaming).toBe(false);
    expect(state.error?.code).toBe("FAIL");
  });
});
