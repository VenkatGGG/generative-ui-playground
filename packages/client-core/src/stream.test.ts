import { describe, expect, it } from "vitest";
import { formatSseEvent } from "./stream";

describe("formatSseEvent", () => {
  it("formats stream events as SSE lines", () => {
    const text = formatSseEvent({
      type: "status",
      generationId: "g1",
      stage: "pass1"
    });

    expect(text.startsWith("data: ")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(true);
  });
});
