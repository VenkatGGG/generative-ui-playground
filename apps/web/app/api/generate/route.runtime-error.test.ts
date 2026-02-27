import { afterEach, describe, expect, it, vi } from "vitest";

describe("generate route runtime dependency failures", () => {
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
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          threadId: "thread-1",
          prompt: "build card",
          baseVersionId: null
        })
      })
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string; message: string };
    expect(payload.error).toBe("RUNTIME_DEPENDENCY_ERROR");
    expect(payload.message).toContain("runtime-init-failed");
  });
});
