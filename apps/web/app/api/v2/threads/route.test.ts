import { describe, expect, it } from "vitest";
import { GET as getThread } from "../threads/[threadId]/route";
import { POST as createThread } from "../threads/route";

describe("v2 threads routes", () => {
  it("creates and fetches v2 thread bundle", async () => {
    const createResponse = await createThread(
      new Request("http://localhost/api/v2/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test Thread V2" })
      })
    );

    expect(createResponse.status).toBe(201);

    const created = (await createResponse.json()) as { thread: { threadId: string } };
    const getResponse = await getThread(new Request("http://localhost"), {
      params: Promise.resolve({ threadId: created.thread.threadId })
    });

    expect(getResponse.status).toBe(200);
    const bundle = (await getResponse.json()) as { thread: { threadId: string } };
    expect(bundle.thread.threadId).toBe(created.thread.threadId);
  });
});
