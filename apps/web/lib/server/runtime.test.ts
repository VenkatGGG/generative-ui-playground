import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  ...process.env
};

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("runtime adapter selection", () => {
  it("uses local stubs by default", async () => {
    delete process.env.ADAPTER_MODE;

    const { getRuntimeDeps } = await import("./runtime");
    const deps = await getRuntimeDeps();

    const result = await deps.model.extractComponents({
      prompt: "Build a pricing card",
      previousSpec: null
    });

    expect(result.components.length).toBeGreaterThan(0);
  });

  it("fails fast when real mode is missing required env", async () => {
    process.env.ADAPTER_MODE = "real";
    delete process.env.GEMINI_API_KEY;

    const { getRuntimeDeps } = await import("./runtime");
    await expect(getRuntimeDeps()).rejects.toThrow("GEMINI_API_KEY");
  });
});
