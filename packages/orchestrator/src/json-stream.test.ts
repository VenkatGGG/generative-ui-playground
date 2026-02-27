import { describe, expect, it } from "vitest";
import { extractCompleteJsonObjects } from "./json-stream";

describe("extractCompleteJsonObjects", () => {
  it("extracts multiple objects from mixed buffer", () => {
    const result = extractCompleteJsonObjects(
      'noise {"id":"a","type":"Card"} trailing {"id":"b","type":"Button"}'
    );

    expect(result.objects).toHaveLength(2);
    expect(result.objects[0]).toContain('"id":"a"');
    expect(result.objects[1]).toContain('"id":"b"');
    expect(result.remainder.trim()).toBe("");
  });

  it("keeps incomplete object as remainder", () => {
    const result = extractCompleteJsonObjects('{"id":"a","type":"Card","children":[{"id":"b"}');

    expect(result.objects).toHaveLength(0);
    expect(result.remainder.startsWith("{")).toBe(true);
  });

  it("handles braces inside strings", () => {
    const result = extractCompleteJsonObjects(
      '{"id":"a","type":"Text","children":["{literal}"]}{"id":"b","type":"Text"}'
    );

    expect(result.objects).toHaveLength(2);
    expect(result.remainder).toBe("");
  });
});
