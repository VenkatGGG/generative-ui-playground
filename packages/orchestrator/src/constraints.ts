import type { UIComponentNode, UISpec } from "@repo/contracts";
import type { ExtractComponentsResult, MCPComponentContext } from "@repo/integrations";

const SUPPORTED_COMPONENT_TYPES = [
  "Text",
  "Card",
  "CardHeader",
  "CardTitle",
  "CardDescription",
  "CardContent",
  "Button",
  "Badge"
] as const;

const SUPPORTED_COMPONENT_SET = new Set<string>(SUPPORTED_COMPONENT_TYPES);
const SUPPORTED_COMPONENT_BY_LOWER = new Map(
  SUPPORTED_COMPONENT_TYPES.map((type) => [type.toLowerCase(), type])
);

const TYPE_ALIASES: Record<string, string> = {
  pricingcard: "Card",
  heading: "CardTitle",
  title: "CardTitle",
  header: "CardTitle",
  h1: "CardTitle",
  h2: "CardTitle",
  h3: "CardTitle",
  h4: "CardTitle",
  h5: "CardTitle",
  h6: "CardTitle",
  subheading: "CardDescription",
  subtitle: "CardDescription",
  description: "CardDescription",
  paragraph: "Text",
  label: "Text",
  pricedisplay: "Text",
  listitem: "Text",
  p: "Text",
  span: "Text",
  body: "Text",
  caption: "Text",
  list: "CardContent",
  stack: "CardContent",
  box: "CardContent",
  container: "CardContent",
  section: "CardContent",
  wrapper: "CardContent",
  div: "CardContent",
  content: "CardContent",
  main: "CardContent",
  flex: "CardContent",
  grid: "CardContent",
  row: "CardContent",
  column: "CardContent",
  footer: "CardContent",
  ctabutton: "Button",
  link: "Button",
  anchor: "Button",
  a: "Button"
};

const COMPLEX_PROMPT_HINT = /\b(pricing|landing|checkout|dashboard|hero|feature|section|form)\b/i;
const SIMPLE_PROMPT_HINT = /\b(simple|minimal|minimalist|minimalistic|single|basic|plain|tiny|compact|just)\b/i;
const BUTTON_HINT = /\bbutton|cta|call to action\b/i;
const BADGE_HINT = /\bbadge\b/i;
const CARD_HINT = /\bcard\b/i;
const QUOTED_TOKEN_RE = /["“”'‘’]([^"“”'‘’]{2,80})["“”'‘’]/g;
const EXACT_NOTE_TOKEN_RE = /exactly\s+["“]([^"”]{2,80})["”]/gi;

export interface ConstraintSet {
  allowedComponentTypes: Set<string>;
  requiredComponentTypes: Set<string>;
  requiredTextTokens: string[];
  minElementCount: number;
  minRootChildren: number;
  requireAtLeastOneTextNode: boolean;
}

export interface ConstraintViolation {
  code:
    | "CONSTRAINT_MIN_ELEMENTS"
    | "CONSTRAINT_MIN_ROOT_CHILDREN"
    | "CONSTRAINT_REQUIRED_COMPONENT"
    | "CONSTRAINT_REQUIRED_TEXT"
    | "CONSTRAINT_TEXT_NODE_REQUIRED"
    | "CONSTRAINT_CARD_STRUCTURE";
  message: string;
}

export interface BuildConstraintInput {
  prompt: string;
  pass1: ExtractComponentsResult;
  mcpContext: MCPComponentContext;
}

function normalizeToken(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function extractQuotedTokens(value: string): string[] {
  const tokens = new Set<string>();
  const matches = value.matchAll(QUOTED_TOKEN_RE);

  for (const match of matches) {
    const token = match[1];
    if (!token) {
      continue;
    }

    const normalized = normalizeToken(token);
    if (normalized.length >= 2 && normalized.length <= 80) {
      tokens.add(normalized);
    }
  }

  return Array.from(tokens);
}

function extractExactTokensFromNotes(context: MCPComponentContext): string[] {
  const tokens = new Set<string>();

  for (const rule of context.componentRules) {
    const matches = rule.notes.matchAll(EXACT_NOTE_TOKEN_RE);
    for (const match of matches) {
      const token = match[1];
      if (!token) {
        continue;
      }

      const normalized = normalizeToken(token);
      if (normalized.length >= 2 && normalized.length <= 80) {
        tokens.add(normalized);
      }
    }
  }

  return Array.from(tokens);
}

export function canonicalizeComponentType(type: string): string {
  const normalized = type.trim();
  const supported = SUPPORTED_COMPONENT_BY_LOWER.get(normalized.toLowerCase());
  if (supported) {
    return supported;
  }

  return TYPE_ALIASES[normalized.toLowerCase()] ?? normalized;
}

export function canonicalizeNodeTypes(node: UIComponentNode): UIComponentNode {
  return {
    ...node,
    type: canonicalizeComponentType(node.type),
    children: node.children?.map((child) =>
      typeof child === "string" ? child : canonicalizeNodeTypes(child)
    )
  };
}

export function getSupportedComponentTypes(): Set<string> {
  return new Set(SUPPORTED_COMPONENT_SET);
}

export function buildConstraintSet(input: BuildConstraintInput): ConstraintSet {
  const prompt = input.prompt;
  const requiredComponentTypes = new Set<string>();

  for (const component of input.pass1.components) {
    const normalized = canonicalizeComponentType(component);
    if (SUPPORTED_COMPONENT_SET.has(normalized)) {
      requiredComponentTypes.add(normalized);
    }
  }

  if (BUTTON_HINT.test(prompt)) {
    requiredComponentTypes.add("Button");
  }
  if (BADGE_HINT.test(prompt)) {
    requiredComponentTypes.add("Badge");
  }
  if (CARD_HINT.test(prompt)) {
    requiredComponentTypes.add("Card");
  }

  const requiredTextTokens = Array.from(
    new Set([...extractQuotedTokens(prompt), ...extractExactTokensFromNotes(input.mcpContext)])
  );

  const tokenDrivenMinimum = Math.min(12, requiredTextTokens.length + 2);
  const complexityFloor = COMPLEX_PROMPT_HINT.test(prompt)
    ? 10
    : SIMPLE_PROMPT_HINT.test(prompt)
      ? 3
      : 5;
  const minElementCount =
    input.pass1.intentType === "new" ? Math.max(tokenDrivenMinimum, complexityFloor) : 1;

  return {
    allowedComponentTypes: getSupportedComponentTypes(),
    requiredComponentTypes,
    requiredTextTokens,
    minElementCount,
    minRootChildren: input.pass1.intentType === "new" ? 1 : 0,
    requireAtLeastOneTextNode: input.pass1.intentType === "new"
  };
}

function getAllStringValues(spec: UISpec): string {
  const tokens: string[] = [];

  for (const element of Object.values(spec.elements)) {
    for (const value of Object.values(element.props ?? {})) {
      if (typeof value === "string") {
        tokens.push(value);
      }
    }
  }

  return tokens.join(" ").toLowerCase();
}

function collectDescendantTypes(spec: UISpec, initialIds: string[]): Set<string> {
  const discoveredTypes = new Set<string>();
  const visited = new Set<string>();
  const queue = [...initialIds];

  while (queue.length > 0) {
    const elementId = queue.shift();
    if (!elementId || visited.has(elementId)) {
      continue;
    }

    visited.add(elementId);
    const element = spec.elements[elementId];
    if (!element) {
      continue;
    }

    discoveredTypes.add(element.type);
    queue.push(...element.children);
  }

  return discoveredTypes;
}

export function validateConstraintSet(spec: UISpec, constraints: ConstraintSet): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const entries = Object.entries(spec.elements);
  const elements = entries.map(([, element]) => element);
  const rootElement = spec.elements[spec.root];

  if (elements.length < constraints.minElementCount) {
    violations.push({
      code: "CONSTRAINT_MIN_ELEMENTS",
      message: `Generated spec has ${elements.length} elements, below required minimum ${constraints.minElementCount}.`
    });
  }

  const rootChildren = rootElement?.children.length ?? 0;
  if (rootChildren < constraints.minRootChildren) {
    violations.push({
      code: "CONSTRAINT_MIN_ROOT_CHILDREN",
      message: `Root element has ${rootChildren} child(ren), below required minimum ${constraints.minRootChildren}.`
    });
  }

  for (const requiredType of constraints.requiredComponentTypes) {
    if (!elements.some((element) => element.type === requiredType)) {
      violations.push({
        code: "CONSTRAINT_REQUIRED_COMPONENT",
        message: `Required component type '${requiredType}' was not generated.`
      });
    }
  }

  const lowerText = getAllStringValues(spec);
  for (const token of constraints.requiredTextTokens) {
    if (!lowerText.includes(token.toLowerCase())) {
      violations.push({
        code: "CONSTRAINT_REQUIRED_TEXT",
        message: `Required visible text token '${token}' was not found.`
      });
    }
  }

  if (constraints.requireAtLeastOneTextNode) {
    const hasTextNode = elements.some(
      (element) => element.type === "Text" && typeof element.props?.text === "string"
    );
    if (!hasTextNode) {
      violations.push({
        code: "CONSTRAINT_TEXT_NODE_REQUIRED",
        message: "At least one visible text node is required for new UI generations."
      });
    }
  }

  for (const [elementId, element] of entries) {
    if (element.type !== "Card") {
      continue;
    }

    const descendantTypes = collectDescendantTypes(spec, element.children);
    const hasHeaderOrTitle =
      descendantTypes.has("CardHeader") || descendantTypes.has("CardTitle");
    const hasContent = descendantTypes.has("CardContent");

    if (!hasHeaderOrTitle || !hasContent) {
      const missing: string[] = [];
      if (!hasHeaderOrTitle) {
        missing.push("CardHeader or CardTitle");
      }
      if (!hasContent) {
        missing.push("CardContent");
      }

      violations.push({
        code: "CONSTRAINT_CARD_STRUCTURE",
        message: `Card '${elementId}' is missing required structure: ${missing.join(" and ")}.`
      });
    }
  }

  return violations;
}
