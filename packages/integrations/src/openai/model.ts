import type {
  ExtractComponentsInput,
  GenerationModelAdapter,
  StreamDesignInput
} from "../interfaces";
import { normalizeExtractComponentsResult } from "../shared/extract-components";
import { parseSseData } from "../shared/sse";
import { ALLOWED_UI_COMPONENT_TYPES, UI_COMPONENT_NODE_JSON_SCHEMA } from "../shared/ui-schema";

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
  response_format?:
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          strict: boolean;
          schema: Record<string, unknown>;
        };
      };
}

const PASS2_EXAMPLE_TREE = {
  id: "root",
  type: "Card",
  props: {
    className: "w-full max-w-md border shadow-sm rounded-xl"
  },
  children: [
    {
      id: "header",
      type: "CardHeader",
      children: [
        {
          id: "title",
          type: "CardTitle",
          children: ["Pro Plan"]
        },
        {
          id: "description",
          type: "CardDescription",
          children: ["Perfect for startups and small teams."]
        }
      ]
    },
    {
      id: "content",
      type: "CardContent",
      children: [
        {
          id: "price",
          type: "Text",
          children: ["$29/mo"]
        },
        {
          id: "badge",
          type: "Badge",
          props: { variant: "secondary" },
          children: ["Popular"]
        },
        {
          id: "cta",
          type: "Button",
          props: { variant: "default", size: "default" },
          children: ["Start Free Trial"]
        }
      ]
    }
  ]
} as const;

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
  const allowedTypes = ALLOWED_UI_COMPONENT_TYPES.join(", ");
  const example = JSON.stringify(PASS2_EXAMPLE_TREE, null, 2);

  return [
    "You generate rich UI tree snapshots for a React renderer.",
    "Output newline-delimited JSON objects only.",
    "Each line must be one complete UIComponentNode object with id,type,props?,children?.",
    "No markdown, no explanations.",
    `Allowed component types ONLY: ${allowedTypes}. Do not invent other types.`,
    "Composition rules:",
    "- Card must contain CardHeader with CardTitle and optional CardDescription.",
    "- Card must contain CardContent for the body/actions.",
    "- Place action components like Button/Badge in CardContent when relevant.",
    "- Textual UI content must be represented as string children.",
    "Generate visually complete output with meaningful copy and spacing cues, not skeletal placeholders.",
    "Reference example of a valid complete snapshot:",
    example,
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
      return normalizeExtractComponentsResult(parsed);
    },
    streamDesign(input) {
      return streamOpenAI(fetchImpl, endpoint, options.apiKey, {
        model: pass2Model,
        messages: [{ role: "user", content: toPass2Prompt(input) }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ui_component_node",
            strict: true,
            schema: UI_COMPONENT_NODE_JSON_SCHEMA
          }
        }
      });
    }
  };
}
