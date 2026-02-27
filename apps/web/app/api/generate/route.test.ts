import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function readSseEvents(response: Response): Promise<Array<{ type: string }>> {
  const text = await response.text();
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));

  return lines.map((line) => JSON.parse(line.replace(/^data:\s*/, "")) as { type: string });
}

describe("generate route", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ADAPTER_MODE: "stub"
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("streams status/patch/done events", async () => {
    const { POST: createThread } = await import("../threads/route");
    const { POST: generate } = await import("./route");

    const createResponse = await createThread(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Generate Thread" })
      })
    );

    const created = (await createResponse.json()) as { thread: { threadId: string; activeVersionId: string } };

    const response = await generate(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        },
        body: JSON.stringify({
          threadId: created.thread.threadId,
          prompt: "Create pricing card",
          baseVersionId: created.thread.activeVersionId
        })
      })
    );

    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    expect(events.some((event) => event.type === "status")).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(true);
  });

  it("returns 409 for stale base version ids", async () => {
    const { POST: createThread } = await import("../threads/route");
    const { POST: generate } = await import("./route");

    const createResponse = await createThread(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Generate Thread" })
      })
    );

    const created = (await createResponse.json()) as { thread: { threadId: string } };

    const response = await generate(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        },
        body: JSON.stringify({
          threadId: created.thread.threadId,
          prompt: "Create pricing card",
          baseVersionId: "stale-version-id"
        })
      })
    );

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("BASE_VERSION_CONFLICT");
  });
});
