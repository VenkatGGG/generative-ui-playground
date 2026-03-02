import { describe, expect, it } from "vitest";
import {
  compileCatalogPromptBlockV2,
  compileGeminiStructuredOutputSchemaV2,
  compileOpenAIStructuredOutputSchemaV2,
  compilePass2ExampleSnapshotV2,
  compileSemanticContractBlockV2
} from "./compiler";

describe("component-catalog compiler", () => {
  it("builds deterministic v2 prompt blocks", () => {
    const block = compileCatalogPromptBlockV2();
    const contract = compileSemanticContractBlockV2();

    expect(block).toContain("AVAILABLE COMPONENTS (15)");
    expect(block).toContain("Card");
    expect(contract).toContain("SEMANTIC CONTRACT:");
    expect(contract).toContain("Output exactly one JSON object");
  });

  it("builds OpenAI v2 structured schema with recursive tree and slots", () => {
    const schema = compileOpenAIStructuredOutputSchemaV2() as {
      $defs?: Record<string, unknown>;
    };
    const defs = schema.$defs ?? {};
    const node = defs.UIComponentNodeV2 as { properties?: Record<string, unknown> };
    expect(node.properties?.slots).toBeDefined();
    expect(node.properties?.children).toBeDefined();
    expect(defs.VisibilityCondition).toBeDefined();
  });

  it("builds Gemini v2 structured schema with depth control and example snapshot", () => {
    const schema = compileGeminiStructuredOutputSchemaV2(3) as {
      properties?: Record<string, unknown>;
    };
    const tree = schema.properties?.tree as { properties?: Record<string, unknown> };
    expect(tree.properties?.children).toBeDefined();
    const visible = tree.properties?.visible as { anyOf?: Array<Record<string, unknown>> };
    const visibleArrayArm = visible?.anyOf?.find((entry) => entry.type === "ARRAY");
    expect(visibleArrayArm?.items).toBeDefined();

    const example = compilePass2ExampleSnapshotV2();
    expect(example.tree).toBeDefined();
  });
});
