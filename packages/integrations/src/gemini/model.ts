import type {
  ExtractComponentsInput,
  ExtractComponentsResult,
  GenerationModelAdapter,
  StreamDesignInput
} from "../interfaces";

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
  };
}

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

function toRequest(prompt: string): GeminiGenerateRequest {
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
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
  const confidence = Math.max(0, Math.min(1, rawConfidence));

  return {
    components,
    intentType,
    confidence
  };
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
      return normalizeExtractComponents(parsed);
    },
    streamDesign(input) {
      const endpoint = buildStreamEndpoint(baseUrl, pass2Model, options.apiKey);
      return streamGemini(fetchImpl, endpoint, toRequest(toPass2Prompt(input)));
    }
  };
}
