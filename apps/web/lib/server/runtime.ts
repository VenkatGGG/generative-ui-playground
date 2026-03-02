import {
  createGenerationModelAdapter,
  createMcpHttpAdapter,
  createShadcnRegistryAdapter,
  createStubGenerationModel,
  createStubMcpAdapter,
  type LLMProvider,
  type ModelProviderConfig
} from "@repo/integrations";
import { InMemoryPersistenceAdapter } from "@repo/persistence";
import type { OrchestratorDeps } from "@repo/orchestrator";

type RuntimeMode = "stub" | "real";

let runtimeDepsPromise: Promise<OrchestratorDeps> | null = null;

function resolveMode(): RuntimeMode {
  const raw = process.env.ADAPTER_MODE?.toLowerCase();
  return raw === "real" ? "real" : "stub";
}

function resolveLlmProvider(): LLMProvider {
  const raw = process.env.LLM_PROVIDER?.toLowerCase();
  if (!raw || raw === "gemini") {
    return "gemini";
  }

  if (raw === "openai") {
    return "openai";
  }

  throw new Error(`Unsupported LLM_PROVIDER '${raw}'. Supported providers: gemini, openai.`);
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function resolveGeminiPass2MaxOutputTokens(): number {
  const raw = process.env.GEMINI_PASS2_MAX_OUTPUT_TOKENS;
  if (!raw) {
    return 2048;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 2048;
  }

  return parsed;
}

function resolveGeminiPass2ThinkingLevel(): "LOW" | "MEDIUM" | "HIGH" {
  const raw = process.env.GEMINI_PASS2_THINKING_LEVEL?.toUpperCase();
  if (raw === "MEDIUM" || raw === "HIGH") {
    return raw;
  }
  return "LOW";
}

async function createRealRuntimeDeps(): Promise<OrchestratorDeps> {
  const mongoUri = readEnv("MONGODB_URI");
  const mongoDbName = readEnv("MONGODB_DB_NAME");
  const llmProvider = resolveLlmProvider();

  const modelConfig: ModelProviderConfig =
    llmProvider === "openai"
      ? {
          provider: "openai",
          options: {
            apiKey: readEnv("OPENAI_API_KEY"),
            baseUrl: process.env.OPENAI_BASE_URL,
            pass1Model: process.env.OPENAI_PASS1_MODEL,
            pass2Model: process.env.OPENAI_PASS2_MODEL
          }
        }
      : {
          provider: "gemini",
          options: {
            apiKey: readEnv("GEMINI_API_KEY"),
            baseUrl: process.env.GEMINI_BASE_URL,
            pass1Model: process.env.GEMINI_PASS1_MODEL,
            pass2Model: process.env.GEMINI_PASS2_MODEL,
            pass2MaxOutputTokens: resolveGeminiPass2MaxOutputTokens(),
            pass2ThinkingLevel: resolveGeminiPass2ThinkingLevel()
          }
        };

  const model = createGenerationModelAdapter(modelConfig);

  const mcpEndpoint = process.env.MCP_ENDPOINT;
  const mcp = mcpEndpoint
    ? createMcpHttpAdapter({
        endpoint: mcpEndpoint,
        apiKey: process.env.MCP_API_KEY
      })
    : createShadcnRegistryAdapter({
        itemUrlTemplate: process.env.SHADCN_REGISTRY_URL_TEMPLATE
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
    runtimeDepsPromise = createRuntimeDeps().catch((error: unknown) => {
      runtimeDepsPromise = null;
      throw error;
    });
  }

  return runtimeDepsPromise;
}
