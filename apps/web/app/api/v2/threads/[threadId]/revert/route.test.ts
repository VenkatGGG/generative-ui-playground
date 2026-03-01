import { describe, expect, it } from "vitest";
import { GET as getThread } from "../route";
import { POST as createThread } from "../../route";
import { POST as revertThread } from "./route";

describe("v2 revert route", () => {
  it("returns 404 for unknown version and does not mutate active version", async () => {
    const createResponse = await createThread(
      new Request("http://localhost/api/v2/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Revert Test V2" })
      })
    );

    expect(createResponse.status).toBe(201);

    const created = (await createResponse.json()) as {
      thread: { threadId: string; activeVersionId: string };
    };

    const beforeResponse = await getThread(new Request("http://localhost"), {
      params: Promise.resolve({ threadId: created.thread.threadId })
    });

    const before = (await beforeResponse.json()) as {
      thread: { activeVersionId: string };
    };

    const revertResponse = await revertThread(
      new Request("http://localhost/api/v2/threads/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "missing-version" })
      }),
      {
        params: Promise.resolve({ threadId: created.thread.threadId })
      }
    );

    expect(revertResponse.status).toBe(404);

    const afterResponse = await getThread(new Request("http://localhost"), {
      params: Promise.resolve({ threadId: created.thread.threadId })
    });
    const after = (await afterResponse.json()) as {
      thread: { activeVersionId: string };
    };

    expect(after.thread.activeVersionId).toBe(before.thread.activeVersionId);
  });
});
