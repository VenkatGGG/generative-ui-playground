import { afterEach, describe, expect, it, vi } from "vitest";
import { formatSseEventV2, streamGenerateV2, StreamGenerateErrorV2 } from "./stream-v2";

describe("formatSseEventV2", () => {
  it("formats stream events as SSE lines", () => {
    const text = formatSseEventV2({
      type: "status",
      generationId: "g1",
      stage: "pass1"
    });

    expect(text.startsWith("data: ")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(true);
  });
});

describe("streamGenerateV2", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("consumes usage and done events", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        [
          'data: {"type":"status","generationId":"g1","stage":"pass1"}',
          "",
          'data: {"type":"usage","generationId":"g1","promptTokens":10,"completionTokens":20,"totalTokens":30}',
          "",
          'data: {"type":"done","generationId":"g1","versionId":"v1","specHash":"h1"}',
          ""
        ].join("\n"),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        }
      )
    );

    const events: string[] = [];
    await streamGenerateV2({
      endpoint: "/api/v2/generate",
      body: { threadId: "t1", prompt: "build", baseVersionId: null },
      onEvent: (event) => events.push(event.type)
    });

    expect(events).toEqual(["status", "usage", "done"]);
  });

  it("throws stream interruption error when terminal event is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        ['data: {"type":"status","generationId":"g1","stage":"pass1"}', ""].join("\n"),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        }
      )
    );

    let caught: unknown;
    try {
      await streamGenerateV2({
        endpoint: "/api/v2/generate",
        body: { threadId: "t1", prompt: "build", baseVersionId: null },
        onEvent: () => undefined
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(StreamGenerateErrorV2);
    expect((caught as StreamGenerateErrorV2).code).toBe("STREAM_INTERRUPTED");
  });
});
