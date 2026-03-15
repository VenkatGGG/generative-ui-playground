import type { MCPAdapter, MCPComponentContext } from "../interfaces";

type FetchLike = typeof fetch;

export interface MCPHttpAdapterOptions {
  endpoint: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
  headers?: Record<string, string>;
}

interface MCPHttpResponse {
  contextVersion?: unknown;
  componentRules?: unknown;
}

const FALLBACK_NOTE = "MCP endpoint unavailable; follow catalog contract for this component.";

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function sanitizeComponentRules(
  value: unknown,
  requested: string[]
): MCPComponentContext["componentRules"] {
  if (!Array.isArray(value)) {
      return requested.map((name) => ({
        name,
        allowedProps: [],
        variants: [],
        compositionRules: [],
        supportedEvents: [],
        bindingHints: [],
        notes: FALLBACK_NOTE
      }));
  }

  const rules = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as {
        name?: unknown;
        allowedProps?: unknown;
        variants?: unknown;
        compositionRules?: unknown;
        supportedEvents?: unknown;
        bindingHints?: unknown;
        notes?: unknown;
      };

      if (typeof record.name !== "string") {
        return null;
      }

      return {
        name: record.name,
        allowedProps: sanitizeStringArray(record.allowedProps),
        variants: sanitizeStringArray(record.variants),
        compositionRules: sanitizeStringArray(record.compositionRules),
        supportedEvents: sanitizeStringArray(record.supportedEvents),
        bindingHints: sanitizeStringArray(record.bindingHints),
        notes: typeof record.notes === "string" ? record.notes : ""
      };
    })
    .filter((item): item is MCPComponentContext["componentRules"][number] => item !== null);

  if (rules.length > 0) {
    return rules;
  }

  return requested.map((name) => ({
    name,
    allowedProps: [],
    variants: [],
    compositionRules: [],
    supportedEvents: [],
    bindingHints: [],
    notes: FALLBACK_NOTE
  }));
}

export function createMcpHttpAdapter(options: MCPHttpAdapterOptions): MCPAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async fetchContext(componentNames) {
      if (componentNames.length === 0) {
        return {
          contextVersion: "mcp-http-v1",
          componentRules: []
        };
      }

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...options.headers
        };

        if (options.apiKey) {
          headers.Authorization = `Bearer ${options.apiKey}`;
        }

        const response = await fetchImpl(options.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ componentNames })
        });

        if (!response.ok) {
          return {
            contextVersion: "mcp-http-v1",
            componentRules: sanitizeComponentRules(null, componentNames)
          };
        }

        const payload = (await response.json()) as MCPHttpResponse;

        return {
          contextVersion:
            typeof payload.contextVersion === "string" ? payload.contextVersion : "mcp-http-v1",
          componentRules: sanitizeComponentRules(payload.componentRules, componentNames)
        };
      } catch {
        return {
          contextVersion: "mcp-http-v1",
          componentRules: sanitizeComponentRules(null, componentNames)
        };
      }
    }
  };
}
