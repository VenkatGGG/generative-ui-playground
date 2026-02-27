import { afterEach, describe, expect, it, vi } from "vitest";

describe("thread revert route runtime dependency failures", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unmock("@/lib/server/runtime");
  });

  it("returns 500 with deterministic error payload when runtime deps fail", async () => {
    vi.doMock("@/lib/server/runtime", () => ({
      getRuntimeDeps: vi.fn().mockRejectedValue(new Error("runtime-init-failed"))
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/threads/thread-1/revert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ versionId: "version-1" })
      }),
      {
        params: Promise.resolve({ threadId: "thread-1" })
      }
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string; message: string };
    expect(payload.error).toBe("RUNTIME_DEPENDENCY_ERROR");
    expect(payload.message).toContain("runtime-init-failed");
  });

  it("returns 500 for non-not-found persistence errors", async () => {
    vi.doMock("@/lib/server/runtime", () => ({
      getRuntimeDeps: vi.fn().mockResolvedValue({
        persistence: {
          revertThread: vi.fn().mockRejectedValue(new Error("db-down"))
        }
      })
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/threads/thread-1/revert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ versionId: "version-1" })
      }),
      {
        params: Promise.resolve({ threadId: "thread-1" })
      }
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string; message: string };
    expect(payload.error).toBe("INTERNAL_SERVER_ERROR");
    expect(payload.message).toContain("db-down");
  });
});
