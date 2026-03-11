import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  ...process.env
};

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.__generativeUiRuntimeDepsPromise__ = null;
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
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    process.env.MONGODB_DB_NAME = "genui";

    const { getRuntimeDeps } = await import("./runtime");
    await expect(getRuntimeDeps()).rejects.toThrow("GEMINI_API_KEY");
  });

  it("uses in-memory persistence for real mode when configured", async () => {
    process.env.ADAPTER_MODE = "real";
    process.env.PERSISTENCE_MODE = "memory";
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.MONGODB_URI;
    delete process.env.MONGODB_DB_NAME;

    const { getRuntimeDeps } = await import("./runtime");
    const deps = await getRuntimeDeps();

    const thread = await deps.persistence.createThreadV2({ title: "memory mode" });
    expect(thread.threadId).toBeTruthy();
  });

  it("fails fast for openai provider when api key is missing", async () => {
    process.env.ADAPTER_MODE = "real";
    process.env.LLM_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    process.env.MONGODB_DB_NAME = "genui";

    const { getRuntimeDeps } = await import("./runtime");
    await expect(getRuntimeDeps()).rejects.toThrow("OPENAI_API_KEY");
  });

  it("fails fast for unsupported llm providers", async () => {
    process.env.ADAPTER_MODE = "real";
    process.env.LLM_PROVIDER = "anthropic";
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    process.env.MONGODB_DB_NAME = "genui";

    const { getRuntimeDeps } = await import("./runtime");
    await expect(getRuntimeDeps()).rejects.toThrow("Unsupported LLM_PROVIDER");
  });

  it("allows retry after an initialization failure", async () => {
    process.env.ADAPTER_MODE = "real";
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    process.env.MONGODB_DB_NAME = "genui";
    delete process.env.GEMINI_API_KEY;

    const { getRuntimeDeps } = await import("./runtime");
    await expect(getRuntimeDeps()).rejects.toThrow("GEMINI_API_KEY");

    process.env.ADAPTER_MODE = "stub";
    const deps = await getRuntimeDeps();
    const extracted = await deps.model.extractComponents({
      prompt: "Render a card",
      previousSpec: null
    });

    expect(extracted.components.length).toBeGreaterThan(0);
  });
});
