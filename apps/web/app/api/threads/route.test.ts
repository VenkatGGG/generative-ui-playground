import { describe, expect, it } from "vitest";
import { GET as getThread } from "../threads/[threadId]/route";
import { POST as createThread } from "../threads/route";
import { buildActorRequest, OTHER_TEST_ACTOR_ID } from "@/test-utils/request-auth";

describe("threads routes", () => {
  it("creates and fetches thread bundle", async () => {
    const createResponse = await createThread(
      buildActorRequest("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test Thread" })
      })
    );

    expect(createResponse.status).toBe(201);

    const created = (await createResponse.json()) as { thread: { threadId: string } };
    const getResponse = await getThread(buildActorRequest("http://localhost"), {
      params: Promise.resolve({ threadId: created.thread.threadId })
    });

    expect(getResponse.status).toBe(200);
    const bundle = (await getResponse.json()) as { thread: { threadId: string } };
    expect(bundle.thread.threadId).toBe(created.thread.threadId);
  });

  it("rejects malformed json create requests", async () => {
    const response = await createThread(
      buildActorRequest("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      error: string;
      issues: Array<{ code: string; message: string }>;
    };
    expect(payload.error).toBe("INVALID_REQUEST");
    expect(payload.issues[0]?.code).toBe("invalid_json");
  });

  it("rejects thread reads from a different actor", async () => {
    const createResponse = await createThread(
      buildActorRequest("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Owned Thread" })
      })
    );

    const created = (await createResponse.json()) as { thread: { threadId: string } };
    const getResponse = await getThread(buildActorRequest("http://localhost", {}, OTHER_TEST_ACTOR_ID), {
      params: Promise.resolve({ threadId: created.thread.threadId })
    });

    expect(getResponse.status).toBe(403);
    const payload = (await getResponse.json()) as { error: string };
    expect(payload.error).toBe("THREAD_ACCESS_DENIED");
  });
});
