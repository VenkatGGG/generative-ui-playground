import { describe, expect, it } from "vitest";
import { createStubGenerationModel } from "./model";

describe("createStubGenerationModel", () => {
  it("streams JSON snapshots", async () => {
    const model = createStubGenerationModel();
    const chunks: string[] = [];

    for await (const chunk of model.streamDesign({
      prompt: "Build a pricing card",
      previousSpec: null,
      componentContext: { contextVersion: "v1", componentRules: [] }
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toContain("Card");
  });
});
