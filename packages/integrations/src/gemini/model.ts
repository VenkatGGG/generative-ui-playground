import type {
  ExtractComponentsInput,
  GenerationModelAdapter,
  StreamDesignInput
} from "../interfaces";
import {
  ALLOWED_COMPONENT_TYPES,
  ALLOWED_COMPONENT_TYPES_V2,
  PASS2_EXAMPLE_TREE,
  PASS2_EXAMPLE_TREE_V2,
  buildPass2CatalogSectionV2,
  buildPass2CatalogSection
} from "@repo/component-catalog";
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

function createGeminiActionBindingSchema(): Record<string, unknown> {
  return {
    type: "OBJECT",
    required: ["action"],
    properties: {
      action: {
        type: "STRING",
        enum: ["setState", "pushState", "removeState", "validateForm"]
      },
      params: {
        type: "OBJECT"
      }
    }
  };
}

function createGeminiActionBindingOrArraySchema(): Record<string, unknown> {
  return {
    anyOf: [
      createGeminiActionBindingSchema(),
      { type: "ARRAY", items: createGeminiActionBindingSchema() }
    ]
  };
}

function createGeminiVisibilitySchema(depth: number): Record<string, unknown> {
  const visibilityRef: Record<string, unknown> = {
    type: "OBJECT",
    properties: {
      $state: { type: "STRING" },
      eq: {},
      neq: {},
      gt: { type: "NUMBER" },
      gte: { type: "NUMBER" },
      lt: { type: "NUMBER" },
      lte: { type: "NUMBER" },
      not: { type: "BOOLEAN" }
    }
  };

  if (depth > 1) {
    return {
      anyOf: [
        { type: "BOOLEAN" },
        visibilityRef,
        {
          type: "OBJECT",
          properties: {
            $and: {
              type: "ARRAY",
              items: createGeminiVisibilitySchema(depth - 1)
            }
          }
        },
        {
          type: "OBJECT",
          properties: {
            $or: {
              type: "ARRAY",
              items: createGeminiVisibilitySchema(depth - 1)
            }
          }
        }
      ]
    };
  }

  return {
    anyOf: [{ type: "BOOLEAN" }, visibilityRef]
  };
}

function createGeminiNodeSchemaV2(depth: number): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: "OBJECT",
    required: ["id", "type"],
    properties: {
      id: { type: "STRING" },
      type: { type: "STRING", enum: [...ALLOWED_COMPONENT_TYPES_V2] },
      props: { type: "OBJECT" },
      visible: createGeminiVisibilitySchema(2),
      repeat: {
        type: "OBJECT",
        required: ["statePath"],
        properties: {
          statePath: { type: "STRING" },
          key: { type: "STRING" }
        }
      },
      on: {
        type: "OBJECT",
        properties: {
          press: createGeminiActionBindingOrArraySchema(),
          change: createGeminiActionBindingOrArraySchema(),
          submit: createGeminiActionBindingOrArraySchema()
        }
      },
      watch: {
        type: "OBJECT"
      }
    }
  };

  const childOptions: Array<Record<string, unknown>> = [{ type: "STRING" }];
  if (depth > 1) {
    childOptions.push(createGeminiNodeSchemaV2(depth - 1));
  }

  (schema.properties as Record<string, unknown>).children = {
    type: "ARRAY",
    items: childOptions.length === 1 ? childOptions[0] : { anyOf: childOptions }
  };

  return schema;
}

const GEMINI_UI_TREE_SNAPSHOT_V2_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  required: ["tree"],
  properties: {
    state: {
      type: "OBJECT"
    },
    tree: createGeminiNodeSchemaV2(3)
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
  const example = JSON.stringify(PASS2_EXAMPLE_TREE_V2, null, 2);
  const catalogSection = buildPass2CatalogSectionV2();
  const skillSection = buildPromptSkillSection({ prompt: input.prompt, isV2: true });
  const contractSection = buildPass2ContractBlock(true);

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
    },
    streamDesignV2(input) {
      const endpoint = buildStreamEndpoint(baseUrl, pass2Model, options.apiKey);
      return streamGemini(
        fetchImpl,
        endpoint,
        toRequest(toPass2PromptV2(input), GEMINI_UI_TREE_SNAPSHOT_V2_SCHEMA)
      );
    }
  };
}
