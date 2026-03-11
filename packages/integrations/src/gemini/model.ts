import type {
  ExtractComponentsInput,
  GenerationModelAdapter,
  StreamDesignInput
} from "../interfaces";
import {
  ALLOWED_COMPONENT_TYPES,
  PASS2_EXAMPLE_TREE,
  buildPass2CatalogSection
} from "@repo/component-catalog";
import {
  compileCatalogPromptBlockV2,
  compileGeminiStructuredOutputSchemaV2,
  compilePass2ExampleSnapshotV2,
  compileSemanticContractBlockV2
} from "@repo/component-catalog/compiler";
import { normalizeExtractComponentsResult } from "../shared/extract-components";
import { buildComponentContextPromptSection } from "../shared/component-context-prompt";
import {
  buildPass2ContractBlock,
  buildPromptSkillSection
} from "../shared/prompt-skill";
import { parseSseData } from "../shared/sse";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_PASS1_MODEL = "gemini-2.5-flash";
const DEFAULT_PASS2_MODEL = "gemini-2.5-pro";
const DEFAULT_PASS2_MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_PASS2_THINKING_LEVEL: GeminiThinkingLevel = "LOW";
const STREAM_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const STREAM_MAX_ATTEMPTS = 3;
const STREAM_RETRY_BASE_DELAY_MS = 600;
const STREAM_MAX_OUTPUT_TOKENS_CAP = 8192;

type FetchLike = typeof fetch;
export type GeminiThinkingLevel = "LOW" | "MEDIUM" | "HIGH";

export interface GeminiGenerationModelOptions {
  apiKey: string;
  pass1Model?: string;
  pass2Model?: string;
  pass2MaxOutputTokens?: number;
  pass2ThinkingLevel?: GeminiThinkingLevel;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

interface GeminiGenerateRequest {
  contents: Array<{
    role: "user";
    parts: Array<{ text: string }>;
  }>;
  generationConfig?: {
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
    maxOutputTokens?: number;
    thinkingConfig?: {
      thinkingLevel?: GeminiThinkingLevel;
    };
  };
}

function createGeminiNodeSchema(depth: number): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: "OBJECT",
    required: ["id", "type"],
    properties: {
      id: { type: "STRING" },
      type: { type: "STRING", enum: [...ALLOWED_COMPONENT_TYPES] },
      props: { type: "OBJECT" }
    }
  };

  const childOptions: Array<Record<string, unknown>> = [{ type: "STRING" }];
  if (depth > 1) {
    childOptions.push(createGeminiNodeSchema(depth - 1));
  }

  (schema.properties as Record<string, unknown>).children = {
    type: "ARRAY",
    items: childOptions.length === 1 ? childOptions[0] : { anyOf: childOptions }
  };

  return schema;
}

const GEMINI_UI_COMPONENT_NODE_SCHEMA = createGeminiNodeSchema(4);

const GEMINI_UI_TREE_SNAPSHOT_V2_SCHEMA: Record<string, unknown> =
  compileGeminiStructuredOutputSchemaV2(4);

function buildGenerateEndpoint(baseUrl: string, model: string, apiKey: string): string {
  return `${baseUrl.replace(/\/$/, "")}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function buildStreamEndpoint(baseUrl: string, model: string, apiKey: string): string {
  return `${baseUrl.replace(/\/$/, "")}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isRetryableTransportError(message: string): boolean {
  return (
    message.includes("fetch failed") ||
    message.includes("ECONNRESET") ||
    message.includes("network") ||
    message.includes("timed out")
  );
}

function toPass1Prompt(input: ExtractComponentsInput): string {
  const previousSpec = input.previousSpec ? JSON.stringify(input.previousSpec) : "null";
  return [
    "You are a component extractor for a React UI generator.",
    "Return strict JSON object only with keys: components (string[]), intentType (\"new\"|\"modify\"), confidence (0..1).",
    "Do not include markdown.",
    `Prompt: ${input.prompt}`,
    `PreviousSpec: ${previousSpec}`
  ].join("\n");
}

function toPass2Prompt(input: StreamDesignInput): string {
  const previousSpec = input.previousSpec ? JSON.stringify(input.previousSpec) : "null";
  const contextSection = buildComponentContextPromptSection(input.componentContext);
  const example = JSON.stringify(PASS2_EXAMPLE_TREE, null, 2);
  const catalogSection = buildPass2CatalogSection();
  const skillSection = buildPromptSkillSection({ prompt: input.prompt, isV2: false });
  const contractSection = buildPass2ContractBlock(false);

  return [
    "You generate rich UI tree snapshots for a React renderer with strict contract compliance.",
    contractSection,
    catalogSection,
    skillSection,
    "Composition rules:",
    "- Card must contain CardHeader with CardTitle and optional CardDescription.",
    "- Card must contain CardContent for the body/actions.",
    "- Place action components like Button/Badge in CardContent when relevant.",
    "- Textual UI content must be represented as string children.",
    "Generate visually complete output with meaningful copy and spacing cues, not skeletal placeholders.",
    "Reference example of a valid complete snapshot:",
    example,
    contextSection,
    `Prompt: ${input.prompt}`,
    `PreviousSpec: ${previousSpec}`
  ].join("\n");
}

function toPass2PromptV2(input: StreamDesignInput): string {
  const previousSpec = input.previousSpec ? JSON.stringify(input.previousSpec) : "null";
  const contextSection = buildComponentContextPromptSection(input.componentContext);
  const example = JSON.stringify(compilePass2ExampleSnapshotV2(), null, 2);
  const catalogSection = compileCatalogPromptBlockV2();
  const skillSection = buildPromptSkillSection({ prompt: input.prompt, isV2: true });
  const contractSection = [buildPass2ContractBlock(true), compileSemanticContractBlockV2()].join("\n");

  return [
    "You generate rich semantic UI tree snapshots for a React runtime with strict contract compliance.",
    contractSection,
    catalogSection,
    skillSection,
    "SEMANTIC CONTRACT:",
    "- Use visible for conditional rendering (boolean, $state comparators, $and, $or, not).",
    "- Use repeat with statePath for array iteration.",
    "- Use on for events: press/change/submit with actions setState/pushState/removeState/validateForm.",
    "- Use watch for state-path triggered actions.",
    "- Use dynamic expressions in props/params: {$state}, {$item}, {$index}, {$bindState}, {$bindItem}.",
    "- Return complete visually rich layouts; never return empty skeletons.",
    "Reference example of a valid semantic snapshot:",
    example,
    contextSection,
    `Prompt: ${input.prompt}`,
    `PreviousSpec: ${previousSpec}`
  ].join("\n");
}

function toRequest(
  prompt: string,
  responseSchema?: Record<string, unknown>,
  pass2Config?: { maxOutputTokens: number; thinkingLevel?: GeminiThinkingLevel }
): GeminiGenerateRequest {
  const generationConfig: GeminiGenerateRequest["generationConfig"] = {
    responseMimeType: "application/json"
  };

  if (responseSchema) {
    generationConfig.responseSchema = responseSchema;
    generationConfig.maxOutputTokens = pass2Config?.maxOutputTokens;
    if (pass2Config?.thinkingLevel) {
      generationConfig.thinkingConfig = {
        thinkingLevel: pass2Config.thinkingLevel
      };
    }
  }

  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig
  };
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function extractTextFromGeminiPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  const firstCandidate = candidates[0];
  if (!firstCandidate || typeof firstCandidate !== "object") {
    return "";
  }

  const content = (firstCandidate as { content?: unknown }).content;
  if (!content || typeof content !== "object") {
    return "";
  }

  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return "";
  }

  const texts = parts
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text.length > 0);

  return texts.join("");
}

function extractFinishReasonFromGeminiPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const firstCandidate = candidates[0];
  if (!firstCandidate || typeof firstCandidate !== "object") {
    return null;
  }

  const finishReason = (firstCandidate as { finishReason?: unknown }).finishReason;
  return typeof finishReason === "string" ? finishReason : null;
}

async function callGemini(
  fetchImpl: FetchLike,
  endpoint: string,
  request: GeminiGenerateRequest
): Promise<string> {
  for (let attempt = 1; attempt <= STREAM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const body = await response.text();
        if (attempt < STREAM_MAX_ATTEMPTS && STREAM_RETRYABLE_STATUS_CODES.has(response.status)) {
          await sleep(STREAM_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        throw new Error(`Gemini request failed (${response.status}): ${body}`);
      }

      const payload = (await response.json()) as unknown;
      return extractTextFromGeminiPayload(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < STREAM_MAX_ATTEMPTS && isRetryableTransportError(message)) {
        await sleep(STREAM_RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Gemini request retry loop exhausted.");
}

async function* streamGemini(
  fetchImpl: FetchLike,
  endpoint: string,
  request: GeminiGenerateRequest
): AsyncGenerator<string> {
  let currentRequest = request;
  for (let attempt = 1; attempt <= STREAM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(currentRequest)
      });

      if (!response.ok) {
        const body = await response.text();
        if (attempt < STREAM_MAX_ATTEMPTS && STREAM_RETRYABLE_STATUS_CODES.has(response.status)) {
          await sleep(STREAM_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        throw new Error(`Gemini stream request failed (${response.status}): ${body}`);
      }

      if (!response.body) {
        const fallbackText = await response.text();
        if (fallbackText) {
          yield fallbackText;
        }
        return;
      }

      const bufferedChunks: string[] = [];
      let finishReason: string | null = null;
      for await (const data of parseSseData(response.body)) {
        if (data === "[DONE]") {
          continue;
        }

        const parsed = safeJsonParse(data);
        if (!parsed) {
          continue;
        }

        finishReason = extractFinishReasonFromGeminiPayload(parsed) ?? finishReason;
        const chunk = extractTextFromGeminiPayload(parsed);
        if (chunk.length > 0) {
          bufferedChunks.push(chunk);
        }
      }

      const currentMaxOutputTokens = currentRequest.generationConfig?.maxOutputTokens;
      const canRetryForMaxTokens =
        finishReason === "MAX_TOKENS" &&
        attempt < STREAM_MAX_ATTEMPTS &&
        currentRequest.generationConfig?.responseSchema &&
        typeof currentMaxOutputTokens === "number" &&
        currentMaxOutputTokens < STREAM_MAX_OUTPUT_TOKENS_CAP;

      if (canRetryForMaxTokens) {
        currentRequest = {
          ...currentRequest,
          generationConfig: {
            ...currentRequest.generationConfig,
            maxOutputTokens: Math.min(currentMaxOutputTokens * 2, STREAM_MAX_OUTPUT_TOKENS_CAP)
          }
        };
        continue;
      }

      for (const chunk of bufferedChunks) {
        yield chunk;
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < STREAM_MAX_ATTEMPTS && isRetryableTransportError(message)) {
        await sleep(STREAM_RETRY_BASE_DELAY_MS * attempt);
        continue;
      }

      throw error;
    }
  }
}

export function createGeminiGenerationModel(
  options: GeminiGenerationModelOptions
): GenerationModelAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const pass1Model = options.pass1Model ?? DEFAULT_PASS1_MODEL;
  const pass2Model = options.pass2Model ?? DEFAULT_PASS2_MODEL;
  const pass2MaxOutputTokens = options.pass2MaxOutputTokens ?? DEFAULT_PASS2_MAX_OUTPUT_TOKENS;
  const pass2ThinkingLevel = options.pass2ThinkingLevel ?? DEFAULT_PASS2_THINKING_LEVEL;
  const pass2Config = {
    maxOutputTokens: pass2MaxOutputTokens,
    thinkingLevel: pass2ThinkingLevel
  };

  return {
    async extractComponents(input) {
      const endpoint = buildGenerateEndpoint(baseUrl, pass1Model, options.apiKey);
      const raw = await callGemini(fetchImpl, endpoint, toRequest(toPass1Prompt(input)));
      const parsed = safeJsonParse(raw);
      return normalizeExtractComponentsResult(parsed, input.prompt);
    },
    streamDesign(input) {
      const endpoint = buildStreamEndpoint(baseUrl, pass2Model, options.apiKey);
      return streamGemini(
        fetchImpl,
        endpoint,
        toRequest(toPass2Prompt(input), GEMINI_UI_COMPONENT_NODE_SCHEMA, pass2Config)
      );
    },
    streamDesignV2(input) {
      const endpoint = buildStreamEndpoint(baseUrl, pass2Model, options.apiKey);
      return streamGemini(
        fetchImpl,
        endpoint,
        toRequest(toPass2PromptV2(input), GEMINI_UI_TREE_SNAPSHOT_V2_SCHEMA, pass2Config)
      );
    }
  };
}
