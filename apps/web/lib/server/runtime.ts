import {
  createGeminiGenerationModel,
  createOpenAIGenerationModel,
  createMcpHttpAdapter,
  createStubGenerationModel,
  createStubMcpAdapter
} from "@repo/integrations";
import { InMemoryPersistenceAdapter } from "@repo/persistence";
import type { OrchestratorDeps } from "@repo/orchestrator";

type RuntimeMode = "stub" | "real";
type LlmProvider = "gemini" | "openai";

let runtimeDepsPromise: Promise<OrchestratorDeps> | null = null;

function resolveMode(): RuntimeMode {
  const raw = process.env.ADAPTER_MODE?.toLowerCase();
  return raw === "real" ? "real" : "stub";
}

function resolveLlmProvider(): LlmProvider {
  const raw = process.env.LLM_PROVIDER?.toLowerCase();
  return raw === "openai" ? "openai" : "gemini";
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function createRealRuntimeDeps(): Promise<OrchestratorDeps> {
  const mcpEndpoint = readEnv("MCP_ENDPOINT");
  const mongoUri = readEnv("MONGODB_URI");
  const mongoDbName = readEnv("MONGODB_DB_NAME");
  const llmProvider = resolveLlmProvider();

  const model =
    llmProvider === "openai"
      ? createOpenAIGenerationModel({
          apiKey: readEnv("OPENAI_API_KEY"),
          baseUrl: process.env.OPENAI_BASE_URL,
          pass1Model: process.env.OPENAI_PASS1_MODEL,
          pass2Model: process.env.OPENAI_PASS2_MODEL
        })
      : createGeminiGenerationModel({
          apiKey: readEnv("GEMINI_API_KEY"),
          baseUrl: process.env.GEMINI_BASE_URL,
          pass1Model: process.env.GEMINI_PASS1_MODEL,
          pass2Model: process.env.GEMINI_PASS2_MODEL
        });

  const mcp = createMcpHttpAdapter({
    endpoint: mcpEndpoint,
    apiKey: process.env.MCP_API_KEY
  });

  const { MongoPersistenceAdapter } = await import("@repo/persistence/mongo");
  const persistence = await MongoPersistenceAdapter.connect({
    uri: mongoUri,
    dbName: mongoDbName
  });

  return {
    model,
    mcp,
    persistence
  };
}

async function createRuntimeDeps(): Promise<OrchestratorDeps> {
  if (resolveMode() === "real") {
    return createRealRuntimeDeps();
  }

  return {
    model: createStubGenerationModel(),
    mcp: createStubMcpAdapter(),
    persistence: new InMemoryPersistenceAdapter()
  };
}

export function getRuntimeDeps(): Promise<OrchestratorDeps> {
  if (!runtimeDepsPromise) {
    runtimeDepsPromise = createRuntimeDeps();
  }

  return runtimeDepsPromise;
}
