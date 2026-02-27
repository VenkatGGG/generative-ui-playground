import type {
  ExtractComponentsInput,
  ExtractComponentsResult,
  GenerationModelAdapter,
  StreamDesignInput
} from "../interfaces";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_PASS1_MODEL = "gpt-4.1-mini";
const DEFAULT_PASS2_MODEL = "gpt-4.1";

type FetchLike = typeof fetch;

export interface OpenAIGenerationModelOptions {
  apiKey: string;
  pass1Model?: string;
  pass2Model?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

interface OpenAIChatCompletionRequest {
  model: string;
  messages: Array<{ role: "user"; content: string }>;
  stream?: boolean;
  response_format?: { type: "json_object" };
}

function buildEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
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

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function normalizeExtractComponents(parsed: unknown): ExtractComponentsResult {
  if (!parsed || typeof parsed !== "object") {
    return { components: [], intentType: "new", confidence: 0 };
  }

  const record = parsed as {
    components?: unknown;
    intentType?: unknown;
    confidence?: unknown;
  };

  const components = Array.isArray(record.components)
    ? record.components.filter((item): item is string => typeof item === "string")
    : [];

  const intentType = record.intentType === "modify" ? "modify" : "new";
  const rawConfidence = typeof record.confidence === "number" ? record.confidence : 0;

  return {
    components,
    intentType,
    confidence: Math.max(0, Math.min(1, rawConfidence))
  };
}

function extractAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const first = choices[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

function extractDeltaText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const first = choices[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  const delta = (first as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") {
    return "";
  }

  const content = (delta as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

async function callOpenAI(
  fetchImpl: FetchLike,
  endpoint: string,
  apiKey: string,
  request: OpenAIChatCompletionRequest
): Promise<string> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as unknown;
  return extractAssistantText(payload);
}

async function* parseSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());

      if (dataLines.length > 0) {
        yield dataLines.join("\n");
      }
    }
  }

  buffer += decoder.decode();

  if (buffer.trim().length > 0) {
    const dataLines = buffer
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length > 0) {
      yield dataLines.join("\n");
    }
  }
}

async function* streamOpenAI(
  fetchImpl: FetchLike,
  endpoint: string,
  apiKey: string,
  request: OpenAIChatCompletionRequest
): AsyncGenerator<string> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      ...request,
      stream: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI stream request failed (${response.status}): ${body}`);
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

    const chunk = extractDeltaText(parsed);
    if (chunk.length > 0) {
      yield chunk;
    }
  }
}

export function createOpenAIGenerationModel(
  options: OpenAIGenerationModelOptions
): GenerationModelAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = buildEndpoint(options.baseUrl ?? DEFAULT_BASE_URL);
  const pass1Model = options.pass1Model ?? DEFAULT_PASS1_MODEL;
  const pass2Model = options.pass2Model ?? DEFAULT_PASS2_MODEL;

  return {
    async extractComponents(input) {
      const raw = await callOpenAI(fetchImpl, endpoint, options.apiKey, {
        model: pass1Model,
        messages: [{ role: "user", content: toPass1Prompt(input) }],
        response_format: {
          type: "json_object"
        }
      });

      const parsed = safeJsonParse(raw);
      return normalizeExtractComponents(parsed);
    },
    streamDesign(input) {
      return streamOpenAI(fetchImpl, endpoint, options.apiKey, {
        model: pass2Model,
        messages: [{ role: "user", content: toPass2Prompt(input) }]
      });
    }
  };
}
