import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

interface StreamEventLike {
  type: string;
  versionId?: string;
}

interface ThreadBundleLikeV2 {
  thread: {
    threadId: string;
    activeVersionId: string;
  };
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    reasoning?: string;
    meta?: Record<string, unknown>;
  }>;
  versions: Array<{
    versionId: string;
    baseVersionId: string | null;
    schemaVersion: "v2";
  }>;
}

async function readSseEvents(response: Response): Promise<StreamEventLike[]> {
  const body = await response.text();
  const payloadLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""));

  return payloadLines.map((line) => JSON.parse(line) as StreamEventLike);
}

function getDoneVersionId(events: StreamEventLike[]): string {
  const doneEvent = events.find((event) => event.type === "done");
  expect(doneEvent).toBeDefined();
  expect(doneEvent?.versionId).toBeDefined();
  return doneEvent?.versionId as string;
}

describe("iterative generation e2e v2", () => {
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

  it("supports v2 create -> generate -> refine -> revert lineage", async () => {
    const { POST: generateRoute } = await import("../../app/api/v2/generate/route");
    const { GET: getThreadRoute } = await import("../../app/api/v2/threads/[threadId]/route");
    const { POST: revertRoute } = await import("../../app/api/v2/threads/[threadId]/revert/route");
    const { POST: createThreadRoute } = await import("../../app/api/v2/threads/route");

    const createResponse = await createThreadRoute(
      new Request("http://localhost/api/v2/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "E2E Thread V2" })
      })
    );
    expect(createResponse.status).toBe(201);

    const created = (await createResponse.json()) as {
      thread: { threadId: string; activeVersionId: string };
    };

    const prompts = [
      "Create a pricing card for Pro plan with title, description, price and two CTA buttons.",
      "Refine this into a contact form with email input and submit action.",
      "Refine into a compact dashboard card with three KPI rows."
    ];

    let activeVersionId = created.thread.activeVersionId;
    const generatedVersionIds: string[] = [];

    for (const prompt of prompts) {
      const generationResponse = await generateRoute(
        new Request("http://localhost/api/v2/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream"
          },
          body: JSON.stringify({
            threadId: created.thread.threadId,
            prompt,
            baseVersionId: activeVersionId
          })
        })
      );

      expect(generationResponse.status).toBe(200);
      const events = await readSseEvents(generationResponse);
      expect(events.some((event) => event.type === "status")).toBe(true);
      expect(events.some((event) => event.type === "patch")).toBe(true);
      expect(events.some((event) => event.type === "usage")).toBe(true);
      expect(events.some((event) => event.type === "error")).toBe(false);

      const nextVersion = getDoneVersionId(events);
      generatedVersionIds.push(nextVersion);
      activeVersionId = nextVersion;
    }

    const revertResponse = await revertRoute(
      new Request("http://localhost/api/v2/threads/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: generatedVersionIds[0] })
      }),
      {
        params: Promise.resolve({ threadId: created.thread.threadId })
      }
    );
    expect(revertResponse.status).toBe(201);

    const reverted = (await revertResponse.json()) as {
      version: {
        versionId: string;
        baseVersionId: string | null;
        schemaVersion: "v2";
      };
    };

    const bundleResponse = await getThreadRoute(new Request("http://localhost"), {
      params: Promise.resolve({ threadId: created.thread.threadId })
    });
    expect(bundleResponse.status).toBe(200);

    const bundle = (await bundleResponse.json()) as ThreadBundleLikeV2;
    expect(bundle.thread.activeVersionId).toBe(reverted.version.versionId);
    expect(reverted.version.baseVersionId).toBe(generatedVersionIds[0]);
    expect(reverted.version.schemaVersion).toBe("v2");
    expect(bundle.versions.every((version) => version.schemaVersion === "v2")).toBe(true);

    for (const versionId of generatedVersionIds) {
      expect(bundle.versions.some((version) => version.versionId === versionId)).toBe(true);
    }
    expect(bundle.versions.some((version) => version.versionId === reverted.version.versionId)).toBe(true);

    const assistantMessages = bundle.messages.filter((message) => message.role === "assistant");
    expect(assistantMessages.length).toBe(prompts.length);

    for (const message of assistantMessages) {
      expect(typeof message.content).toBe("string");
      expect(message.content.length).toBeGreaterThan(0);
      expect(typeof message.reasoning).toBe("string");
      expect((message.reasoning as string).length).toBeGreaterThan(0);
      expect(typeof message.meta?.warningCount).toBe("number");
      expect(typeof message.meta?.patchCount).toBe("number");
      expect(typeof message.meta?.durationMs).toBe("number");
      expect(typeof message.meta?.specHash).toBe("string");
      expect(Array.isArray(message.meta?.mcpContextUsed)).toBe(true);
    }
  });
});
