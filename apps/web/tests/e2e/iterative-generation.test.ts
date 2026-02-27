import { describe, expect, it } from "vitest";
import { POST as generateRoute } from "../../app/api/generate/route";
import { GET as getThreadRoute } from "../../app/api/threads/[threadId]/route";
import { POST as revertRoute } from "../../app/api/threads/[threadId]/revert/route";
import { POST as createThreadRoute } from "../../app/api/threads/route";

interface StreamEventLike {
  type: string;
  versionId?: string;
}

interface ThreadBundleLike {
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

describe("iterative generation e2e", () => {
  it("supports generate -> refine -> revert lineage", async () => {
    const createResponse = await createThreadRoute(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "E2E Thread" })
      })
    );

    expect(createResponse.status).toBe(201);

    const created = (await createResponse.json()) as {
      thread: { threadId: string; activeVersionId: string };
    };

    const firstGeneration = await generateRoute(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        },
        body: JSON.stringify({
          threadId: created.thread.threadId,
          prompt: "Create a pricing card with CTA",
          baseVersionId: created.thread.activeVersionId
        })
      })
    );

    expect(firstGeneration.status).toBe(200);
    const firstEvents = await readSseEvents(firstGeneration);
    const version1 = getDoneVersionId(firstEvents);

    const secondGeneration = await generateRoute(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        },
        body: JSON.stringify({
          threadId: created.thread.threadId,
          prompt: "Change button copy to Start Trial",
          baseVersionId: version1
        })
      })
    );

    expect(secondGeneration.status).toBe(200);
    const secondEvents = await readSseEvents(secondGeneration);
    const version2 = getDoneVersionId(secondEvents);

    expect(version2).not.toBe(version1);

    const revertResponse = await revertRoute(
      new Request("http://localhost/api/threads/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version1 })
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
      };
    };

    const bundleResponse = await getThreadRoute(new Request("http://localhost"), {
      params: Promise.resolve({ threadId: created.thread.threadId })
    });

    expect(bundleResponse.status).toBe(200);
    const bundle = (await bundleResponse.json()) as ThreadBundleLike;

    expect(bundle.thread.activeVersionId).toBe(reverted.version.versionId);
    expect(reverted.version.baseVersionId).toBe(version1);
    expect(bundle.versions.some((version) => version.versionId === version1)).toBe(true);
    expect(bundle.versions.some((version) => version.versionId === version2)).toBe(true);
    expect(bundle.versions.some((version) => version.versionId === reverted.version.versionId)).toBe(true);

    const assistantMessages = bundle.messages.filter((message) => message.role === "assistant");
    expect(assistantMessages.length).toBe(2);

    for (const message of assistantMessages) {
      expect(typeof message.reasoning).toBe("string");
      expect((message.reasoning as string).length).toBeGreaterThan(0);
      expect(typeof message.meta?.warningCount).toBe("number");
      expect(typeof message.meta?.patchCount).toBe("number");
      expect(typeof message.meta?.durationMs).toBe("number");
      expect(typeof message.meta?.specHash).toBe("string");
      expect(Array.isArray(message.meta?.mcpContextUsed)).toBe(true);

      expect((message.meta?.warningCount as number) >= 0).toBe(true);
      expect((message.meta?.patchCount as number) > 0).toBe(true);
      expect((message.meta?.durationMs as number) >= 0).toBe(true);
    }
  });
});
