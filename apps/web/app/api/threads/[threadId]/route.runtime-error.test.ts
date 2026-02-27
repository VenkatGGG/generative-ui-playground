import { afterEach, describe, expect, it, vi } from "vitest";

describe("thread read route runtime dependency failures", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unmock("@/lib/server/runtime");
  });

  it("returns 500 with deterministic error payload when runtime deps fail", async () => {
    vi.doMock("@/lib/server/runtime", () => ({
      getRuntimeDeps: vi.fn().mockRejectedValue(new Error("runtime-init-failed"))
    }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/threads/thread-1"), {
      params: Promise.resolve({ threadId: "thread-1" })
    });

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string; message: string };
    expect(payload.error).toBe("RUNTIME_DEPENDENCY_ERROR");
    expect(payload.message).toContain("runtime-init-failed");
  });

  it("returns 500 for persistence failures with deterministic payload", async () => {
    vi.doMock("@/lib/server/runtime", () => ({
      getRuntimeDeps: vi.fn().mockResolvedValue({
        persistence: {
          getThreadBundle: vi.fn().mockRejectedValue(new Error("db-down"))
        }
      })
    }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/threads/thread-1"), {
      params: Promise.resolve({ threadId: "thread-1" })
    });

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string; message: string };
    expect(payload.error).toBe("INTERNAL_SERVER_ERROR");
    expect(payload.message).toContain("db-down");
  });
});
