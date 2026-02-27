import { afterEach, describe, expect, it, vi } from "vitest";
import { formatSseEvent, streamGenerate, StreamGenerateError } from "./stream";

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

describe("streamGenerate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("consumes events until terminal done", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        [
          'data: {"type":"status","generationId":"g1","stage":"pass1"}',
          "",
          'data: {"type":"done","generationId":"g1","versionId":"v1","specHash":"h1"}',
          ""
        ].join("\n"),
        {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      )
    );

    const events: string[] = [];
    await streamGenerate({
      endpoint: "/api/generate",
      body: { threadId: "t1", prompt: "build", baseVersionId: null },
      onEvent: (event) => {
        events.push(event.type);
      }
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["status", "done"]);
  });

  it("throws stream interruption error when terminal event is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        ['data: {"type":"status","generationId":"g1","stage":"pass1"}', ""].join("\n"),
        {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      )
    );

    let caught: unknown;
    try {
      await streamGenerate({
        endpoint: "/api/generate",
        body: { threadId: "t1", prompt: "build", baseVersionId: null },
        onEvent: () => undefined
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(StreamGenerateError);
    expect((caught as StreamGenerateError).code).toBe("STREAM_INTERRUPTED");
  });

  it("rethrows client handler errors and stops consuming the stream", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        [
          'data: {"type":"status","generationId":"g1","stage":"pass1"}',
          "",
          'data: {"type":"done","generationId":"g1","versionId":"v1","specHash":"h1"}',
          ""
        ].join("\n"),
        {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      )
    );

    let handled = 0;
    await expect(
      streamGenerate({
        endpoint: "/api/generate",
        body: { threadId: "t1", prompt: "build", baseVersionId: null },
        onEvent: (event) => {
          handled += 1;
          if (event.type === "status") {
            throw new Error("PATCH_APPLY_FAILED:bad patch");
          }
        }
      })
    ).rejects.toThrow("PATCH_APPLY_FAILED:bad patch");

    expect(handled).toBe(1);
  });
});
