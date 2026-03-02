import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  ...process.env
};

function buildMockRuntimeModules() {
  const createGenerationModelAdapter = vi.fn(() => ({
    extractComponents: vi.fn(async () => ({ components: [], intentType: "new", confidence: 1 })),
    streamDesign: vi.fn(async function* streamDesign() {
      yield '{"id":"root","type":"Card"}';
    })
  }));

  const createMcpHttpAdapter = vi.fn(() => ({
    fetchContext: vi.fn(async () => ({ contextVersion: "mcp-http-v1", componentRules: [] }))
  }));

  const createShadcnRegistryAdapter = vi.fn(() => ({
    fetchContext: vi.fn(async () => ({ contextVersion: "shadcn-registry-v1", componentRules: [] }))
  }));

  const mongoConnect = vi.fn(async () => ({
    createThread: vi.fn(),
    getThreadBundle: vi.fn(),
    getThreadBundleV2: vi.fn(),
    getVersion: vi.fn(),
    getVersionV2: vi.fn(),
    persistGeneration: vi.fn(),
    persistGenerationV2: vi.fn(),
    recordGenerationFailure: vi.fn()
  }));

  vi.doMock("@repo/integrations", () => ({
    createGenerationModelAdapter,
    createMcpHttpAdapter,
    createShadcnRegistryAdapter,
    createStubGenerationModel: vi.fn(),
    createStubMcpAdapter: vi.fn()
  }));

  vi.doMock("@repo/persistence/mongo", () => ({
    MongoPersistenceAdapter: {
      connect: mongoConnect
    }
  }));

  return {
    createGenerationModelAdapter,
    createMcpHttpAdapter,
    createShadcnRegistryAdapter,
    mongoConnect
  };
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
  vi.clearAllMocks();
});

describe("runtime gemini pass2 controls", () => {
  it("passes explicit gemini pass2 controls from env", async () => {
    process.env.ADAPTER_MODE = "real";
    process.env.LLM_PROVIDER = "gemini";
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    process.env.MONGODB_DB_NAME = "genui";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_PASS2_MAX_OUTPUT_TOKENS = "3072";
    process.env.GEMINI_PASS2_THINKING_LEVEL = "MEDIUM";

    const mocks = buildMockRuntimeModules();
    const { getRuntimeDeps } = await import("./runtime");
    await getRuntimeDeps();

    expect(mocks.createGenerationModelAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gemini",
        options: expect.objectContaining({
          pass2MaxOutputTokens: 3072,
          pass2ThinkingLevel: "MEDIUM"
        })
      })
    );
  });

  it("uses defaults when gemini pass2 controls are unset or invalid", async () => {
    process.env.ADAPTER_MODE = "real";
    process.env.LLM_PROVIDER = "gemini";
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    process.env.MONGODB_DB_NAME = "genui";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_PASS2_MAX_OUTPUT_TOKENS = "not-a-number";
    delete process.env.GEMINI_PASS2_THINKING_LEVEL;

    const mocks = buildMockRuntimeModules();
    const { getRuntimeDeps } = await import("./runtime");
    await getRuntimeDeps();

    expect(mocks.createGenerationModelAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gemini",
        options: expect.objectContaining({
          pass2MaxOutputTokens: 2048,
          pass2ThinkingLevel: undefined
        })
      })
    );
  });
});
