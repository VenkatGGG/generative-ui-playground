import { describe, expect, it } from "vitest";
import { parseSseData } from "./sse";

describe("parseSseData", () => {
  it("parses data events from chunked sse stream", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: one\n\n"));
        controller.enqueue(encoder.encode("data: two\n\n"));
        controller.close();
      }
    });

    const items: string[] = [];
    for await (const item of parseSseData(stream)) {
      items.push(item);
    }

    expect(items).toEqual(["one", "two"]);
  });

  it("joins multi-line data payloads", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: line1\ndata: line2\n\n"));
        controller.close();
      }
    });

    const items: string[] = [];
    for await (const item of parseSseData(stream)) {
      items.push(item);
    }

    expect(items).toEqual(["line1\nline2"]);
  });
});
