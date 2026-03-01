import type { MCPAdapter, MCPComponentContext } from "../interfaces";
import { COMPONENT_CATALOG, canonicalizeCatalogComponentType } from "@repo/component-catalog";

type FetchLike = typeof fetch;

const DEFAULT_ITEM_URL_TEMPLATE = "https://ui.shadcn.com/r/{name}.json";
const DEFAULT_CONTEXT_VERSION = "shadcn-registry-v1";
const CATALOG_RULES = new Map<string, readonly string[]>(
  COMPONENT_CATALOG.map((entry) => [entry.type, entry.compositionRules ?? []] as const)
);
const CATALOG_ALLOWED_PROPS = new Map<string, readonly string[]>(
  COMPONENT_CATALOG.map((entry) => [entry.type, entry.allowedProps] as const)
);
const CATALOG_VARIANTS = new Map<string, readonly string[]>(
  COMPONENT_CATALOG.map((entry) => [entry.type, entry.variants ?? []] as const)
);

export interface ShadcnRegistryAdapterOptions {
  itemUrlTemplate?: string;
  contextVersion?: string;
  fetchImpl?: FetchLike;
  headers?: Record<string, string>;
}

interface RegistryItemPayload {
  name?: unknown;
  type?: unknown;
  title?: unknown;
  description?: unknown;
  dependencies?: unknown;
  registryDependencies?: unknown;
  files?: unknown;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function resolveRegistryItemName(componentName: string): string | null {
  if (componentName === "Text") {
    return null;
  }

  if (componentName === "Card" || componentName.startsWith("Card")) {
    return "card";
  }

  return toKebabCase(componentName);
}

function buildItemUrl(template: string, itemName: string): string {
  return template.replace("{name}", encodeURIComponent(itemName));
}

function extractVariantHints(files: unknown): string[] {
  if (!Array.isArray(files)) {
    return [];
  }

  const hints = new Set<string>();

  for (const file of files) {
    if (!file || typeof file !== "object") {
      continue;
    }

    const content = (file as { content?: unknown }).content;
    if (typeof content !== "string") {
      continue;
    }

    const variantBlockMatches = content.matchAll(
      /variants\s*:\s*\{([\s\S]*?)\}\s*,\s*defaultVariants/gm
    );

    for (const variantBlockMatch of variantBlockMatches) {
      const variantBlock = variantBlockMatch[1];
      if (!variantBlock) {
        continue;
      }

      const groupMatches = variantBlock.matchAll(/([A-Za-z0-9_]+)\s*:\s*\{([\s\S]*?)\}\s*(,|$)/gm);

      for (const groupMatch of groupMatches) {
        const groupName = groupMatch[1];
        const groupBody = groupMatch[2];

        if (!groupName || !groupBody) {
          continue;
        }

        const valueMatches = groupBody.matchAll(/([A-Za-z0-9_]+)\s*:/g);
        for (const valueMatch of valueMatches) {
          const valueName = valueMatch[1];
          if (!valueName) {
            continue;
          }

          hints.add(`${groupName}:${valueName}`);
        }
      }
    }
  }

  return Array.from(hints);
}

function buildRuleNotes(
  componentName: string,
  itemName: string | null,
  url: string | null,
  payload: RegistryItemPayload | null,
  errorMessage: string | null
): string {
  if (!itemName || !url) {
    return `No direct shadcn registry item lookup was performed for component '${componentName}'.`;
  }

  if (errorMessage) {
    return `Registry lookup for '${componentName}' using item '${itemName}' failed. ${errorMessage}`;
  }

  if (!payload) {
    return `Registry lookup for '${componentName}' using item '${itemName}' returned no payload.`;
  }

  const segments: string[] = [`Registry item: ${itemName}.`, `Source: ${url}.`];

  if (typeof payload.type === "string") {
    segments.push(`Type: ${payload.type}.`);
  }

  if (typeof payload.title === "string") {
    segments.push(`Title: ${payload.title}.`);
  }

  if (typeof payload.description === "string") {
    segments.push(`Description: ${payload.description}.`);
  }

  const dependencies = sanitizeStringArray(payload.dependencies);
  if (dependencies.length > 0) {
    segments.push(`Dependencies: ${dependencies.join(", ")}.`);
  }

  const registryDependencies = sanitizeStringArray(payload.registryDependencies);
  if (registryDependencies.length > 0) {
    segments.push(`Registry dependencies: ${registryDependencies.join(", ")}.`);
  }

  return segments.join(" ");
}

function resolveCompositionRules(componentName: string): string[] {
  const normalized = canonicalizeCatalogComponentType(componentName);
  const rules = CATALOG_RULES.get(normalized);
  return rules ? [...rules] : [];
}

function resolveAllowedProps(componentName: string): string[] {
  const normalized = canonicalizeCatalogComponentType(componentName);
  const allowedProps = CATALOG_ALLOWED_PROPS.get(normalized);
  return allowedProps ? [...allowedProps] : ["className"];
}

function resolveVariants(componentName: string, variantHints: string[]): string[] {
  if (variantHints.length > 0) {
    return variantHints;
  }

  const normalized = canonicalizeCatalogComponentType(componentName);
  const variants = CATALOG_VARIANTS.get(normalized);
  return variants ? [...variants] : [];
}

type LookupResult = {
  payload: RegistryItemPayload | null;
  errorMessage: string | null;
  url: string;
};

export function createShadcnRegistryAdapter(options: ShadcnRegistryAdapterOptions = {}): MCPAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const itemUrlTemplate = options.itemUrlTemplate ?? DEFAULT_ITEM_URL_TEMPLATE;
  const contextVersion = options.contextVersion ?? DEFAULT_CONTEXT_VERSION;

  return {
    async fetchContext(componentNames) {
      if (componentNames.length === 0) {
        return {
          contextVersion,
          componentRules: []
        };
      }

      const uniqueItemNames = Array.from(
        new Set(componentNames.map(resolveRegistryItemName).filter((name): name is string => Boolean(name)))
      );

      const lookupMap = new Map<string, LookupResult>();

      for (const itemName of uniqueItemNames) {
        const url = buildItemUrl(itemUrlTemplate, itemName);

        try {
          const response = await fetchImpl(url, {
            method: "GET",
            headers: options.headers
          });

          if (!response.ok) {
            lookupMap.set(itemName, {
              payload: null,
              errorMessage: `HTTP ${response.status}`,
              url
            });
            continue;
          }

          const payload = (await response.json()) as RegistryItemPayload;
          lookupMap.set(itemName, {
            payload,
            errorMessage: null,
            url
          });
        } catch (error) {
          lookupMap.set(itemName, {
            payload: null,
            errorMessage: error instanceof Error ? error.message : "Unknown registry lookup error.",
            url
          });
        }
      }

      const componentRules: MCPComponentContext["componentRules"] = componentNames.map((componentName) => {
        const itemName = resolveRegistryItemName(componentName);
        const lookup = itemName ? lookupMap.get(itemName) : null;
        const payload = lookup?.payload ?? null;

        const variantHints = extractVariantHints(payload?.files);

        return {
          name: componentName,
          allowedProps: resolveAllowedProps(componentName),
          variants: resolveVariants(componentName, variantHints),
          compositionRules: resolveCompositionRules(componentName),
          notes: buildRuleNotes(
            componentName,
            itemName,
            lookup?.url ?? null,
            payload,
            lookup?.errorMessage ?? null
          )
        };
      });

      return {
        contextVersion,
        componentRules
      };
    }
  };
}
