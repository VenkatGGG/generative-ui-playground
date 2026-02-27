import type {
  ExtractComponentsInput,
  GenerationModelAdapter,
  StreamDesignInput
} from "../interfaces";
import { normalizeExtractComponentsResult } from "../shared/extract-components";
import { parseSseData } from "../shared/sse";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_PASS1_MODEL = "gemini-2.5-flash";
const DEFAULT_PASS2_MODEL = "gemini-2.5-pro";

type FetchLike = typeof fetch;

export interface GeminiGenerationModelOptions {
  apiKey: string;
  pass1Model?: string;
  pass2Model?: string;
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
  };
}

const GEMINI_UI_COMPONENT_NODE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  required: ["id", "type"],
  properties: {
    id: { type: "STRING" },
    type: { type: "STRING" },
    props: { type: "OBJECT" },
    children: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["id", "type"],
        properties: {
          id: { type: "STRING" },
          type: { type: "STRING" },
          props: { type: "OBJECT" },
          children: {
            type: "ARRAY",
            items: { type: "OBJECT" }
          }
        }
      }
    }
  }
};

function buildGenerateEndpoint(baseUrl: string, model: string, apiKey: string): string {
  return `${baseUrl.replace(/\/$/, "")}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function buildStreamEndpoint(baseUrl: string, model: string, apiKey: string): string {
  return `${baseUrl.replace(/\/$/, "")}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
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
  const context = JSON.stringify(input.componentContext);

  return [
    "You generate UI tree snapshots for a React renderer.",
    "Output newline-delimited JSON objects only.",
    "Each line must be one complete UIComponentNode object with id,type,props?,children?.",
    "No markdown, no explanations.",
    `Prompt: ${input.prompt}`,
    `PreviousSpec: ${previousSpec}`,
    `ComponentContext: ${context}`
  ].join("\n");
}

function toRequest(prompt: string, responseSchema?: Record<string, unknown>): GeminiGenerateRequest {
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      ...(responseSchema ? { responseSchema } : {})
    }
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

async function callGemini(
  fetchImpl: FetchLike,
  endpoint: string,
  request: GeminiGenerateRequest
): Promise<string> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as unknown;
  return extractTextFromGeminiPayload(payload);
}

async function* streamGemini(
  fetchImpl: FetchLike,
  endpoint: string,
  request: GeminiGenerateRequest
): AsyncGenerator<string> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini stream request failed (${response.status}): ${body}`);
  }

  if (!response.body) {
    const fallbackText = await response.text();
    if (fallbackText) {
      yield fallbackText;
    }
    return;
  }

  for await (const data of parseSseData(response.body)) {
    if (data === "[DONE]") {
      continue;
    }

    const parsed = safeJsonParse(data);
    if (!parsed) {
      continue;
    }

    const chunk = extractTextFromGeminiPayload(parsed);
    if (chunk.length > 0) {
      yield chunk;
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

  return {
    async extractComponents(input) {
      const endpoint = buildGenerateEndpoint(baseUrl, pass1Model, options.apiKey);
      const raw = await callGemini(fetchImpl, endpoint, toRequest(toPass1Prompt(input)));
      const parsed = safeJsonParse(raw);
      return normalizeExtractComponentsResult(parsed);
    },
    streamDesign(input) {
      const endpoint = buildStreamEndpoint(baseUrl, pass2Model, options.apiKey);
      return streamGemini(
        fetchImpl,
        endpoint,
        toRequest(toPass2Prompt(input), GEMINI_UI_COMPONENT_NODE_SCHEMA)
      );
    }
  };
}
