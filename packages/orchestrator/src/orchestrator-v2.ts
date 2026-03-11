import { createHash, randomUUID } from "node:crypto";
import {
  UITreeSnapshotV2Schema,
  type GenerateRequestV2,
  type StreamEventV2,
  type UIComponentNodeV2,
  type UITreeSnapshotV2,
  type UISpecV2
} from "@repo/contracts";
import { getAllowedComponentTypeSetV2 } from "@repo/component-catalog";
import {
  autoFixStructuralSpecV2,
  diffSpecs,
  normalizeTreeToSpecV2,
  validateSpecV2,
  validateStructuralSpecV2
} from "@repo/spec-engine";
import {
  buildRetryPromptWithValidationFeedback,
  detectPromptPack,
  estimatePromptPackMinElements,
  extractStyleTokens,
  type GenerationModelAdapter,
  type MCPAdapter
} from "@repo/integrations";
import type { PersistenceAdapter } from "@repo/persistence";
import { extractCompleteJsonObjects } from "./json-stream";
import {
  buildConstraintSetV2,
  isUsableSpecForPromptPackV2,
  validateConstraintSetV2
} from "./constraints-v2";
import { applyPresentationDefaultsV2 } from "./presentation-v2";

export interface OrchestratorDepsV2 {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapter;
}

const MAX_PASS2_ATTEMPTS = 3;
const RECOVERY_RESTART_MARKERS = ['{"state"', '{ "state"', '{"tree"', '{ "tree"', '{"id"', '{ "id"', "```json", "```"];

interface ModelToolCall {
  tool: "mcp.fetchContext";
  components: string[];
}

function specHash(spec: UISpecV2): string {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

function tokenEstimate(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function buildStructuralSignature(spec: UISpecV2): string {
  const normalized = Object.entries(spec.elements)
    .map(([id, element]) => ({
      id,
      type: element.type,
      children: [...element.children]
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify({
    root: spec.root,
    elements: normalized
  });
}

function parseCandidateSnapshotV2(input: string): UITreeSnapshotV2 | null {
  const queue = [input];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const candidate = sanitizeJsonLikeText(queue.shift() ?? "");
    if (!candidate || visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    const parsed = safeParseJsonCandidate(candidate);
    if (parsed) {
      return parsed;
    }

    for (const recovered of extractRecoverableJsonObjects(candidate)) {
      if (!visited.has(recovered)) {
        queue.push(recovered);
      }
    }
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function coerceNodeV2(input: unknown): UIComponentNodeV2 | null {
  if (!isPlainObject(input)) {
    return null;
  }

  if (typeof input.id !== "string" || typeof input.type !== "string") {
    return null;
  }

  const children: UIComponentNodeV2["children"] = [];
  if (Array.isArray(input.children)) {
    for (const child of input.children) {
      if (typeof child === "string") {
        children.push(child);
        continue;
      }
      const coercedChild = coerceNodeV2(child);
      if (coercedChild) {
        children.push(coercedChild);
      }
    }
  }

  const slots = isPlainObject(input.slots)
    ? Object.fromEntries(
        Object.entries(input.slots)
          .filter(([, value]) => Array.isArray(value))
          .map(([name, value]) => [
            name,
            (value as unknown[]).filter((entry): entry is string => typeof entry === "string")
          ])
      )
    : undefined;
  const repeat =
    isPlainObject(input.repeat) && typeof input.repeat.statePath === "string"
      ? (input.repeat as unknown as UIComponentNodeV2["repeat"])
      : undefined;

  return {
    id: input.id,
    type: input.type,
    props: isPlainObject(input.props) ? input.props : {},
    children,
    ...(slots && Object.keys(slots).length > 0 ? { slots } : {}),
    ...(input.visible !== null && input.visible !== undefined ? { visible: input.visible as UIComponentNodeV2["visible"] } : {}),
    ...(repeat ? { repeat } : {}),
    ...(isPlainObject(input.on) ? { on: input.on as UIComponentNodeV2["on"] } : {}),
    ...(isPlainObject(input.watch) ? { watch: input.watch as UIComponentNodeV2["watch"] } : {})
  };
}

function coerceSnapshotV2(input: unknown): UITreeSnapshotV2 | null {
  if (!isPlainObject(input)) {
    return null;
  }

  const maybeTree = isPlainObject(input.tree) ? input.tree : input;
  const tree = coerceNodeV2(maybeTree);
  if (!tree) {
    return null;
  }

  return {
    ...(isPlainObject(input.state) ? { state: input.state } : {}),
    tree
  };
}

function parseModelToolCall(input: string): ModelToolCall | null {
  try {
    const parsed = JSON.parse(sanitizeJsonLikeText(input)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const tool = (parsed as { tool?: unknown }).tool;
    const components = (parsed as { components?: unknown }).components;
    if (tool !== "mcp.fetchContext" || !Array.isArray(components)) {
      return null;
    }
    const normalized = components.filter((value): value is string => typeof value === "string");
    if (normalized.length === 0) {
      return null;
    }
    return {
      tool,
      components: Array.from(new Set(normalized))
    };
  } catch {
    return null;
  }
}

function extractRecoverableJsonObjects(input: string): string[] {
  const sanitized = sanitizeJsonLikeText(input);
  if (!sanitized) {
    return [];
  }

  const recovered = new Set<string>();
  const trimmed = sanitized.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    recovered.add(trimmed);
  }

  const restartMarkers = [...RECOVERY_RESTART_MARKERS, '{"tool"', '{ "tool"'];
  for (const marker of restartMarkers) {
    let index = sanitized.indexOf(marker);
    while (index >= 0) {
      const sliced = sanitized.slice(index);
      const extracted = extractCompleteJsonObjects(sliced);
      for (const objectText of extracted.objects) {
        const clean = sanitizeJsonLikeText(objectText);
        if (clean) {
          recovered.add(clean);
        }
      }
      index = sanitized.indexOf(marker, index + marker.length);
    }
  }

  return Array.from(recovered);
}

function sanitizeJsonLikeText(input: string): string {
  let sanitized = input.trim();
  if (!sanitized) {
    return "";
  }

  sanitized = sanitized.replace(/^assistant:\s*/i, "").trim();
  sanitized = sanitized.replace(/^```json\s*/i, "").trim();
  sanitized = sanitized.replace(/^```\s*/i, "").trim();
  sanitized = sanitized.replace(/\s*```$/i, "").trim();

  const firstBraceIndex = sanitized.indexOf("{");
  if (firstBraceIndex > 0) {
    sanitized = sanitized.slice(firstBraceIndex).trim();
  }

  return sanitized;
}

function safeParseJsonCandidate(input: string): UITreeSnapshotV2 | null {
  try {
    const parsed = JSON.parse(input) as unknown;
    const snapshotResult = UITreeSnapshotV2Schema.safeParse(parsed);
    if (snapshotResult.success) {
      return snapshotResult.data as UITreeSnapshotV2;
    }

    const coercedSnapshot = coerceSnapshotV2(parsed);
    if (coercedSnapshot) {
      const coercedResult = UITreeSnapshotV2Schema.safeParse(coercedSnapshot);
      return coercedResult.success ? (coercedResult.data as UITreeSnapshotV2) : coercedSnapshot;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { id?: unknown }).id === "string" &&
      typeof (parsed as { type?: unknown }).type === "string"
    ) {
      const wrapped = UITreeSnapshotV2Schema.safeParse({ tree: parsed });
      return wrapped.success ? (wrapped.data as UITreeSnapshotV2) : null;
    }

    return null;
  } catch {
    return null;
  }
}

function mergeMcpContexts(base: Awaited<ReturnType<MCPAdapter["fetchContext"]>>, next: Awaited<ReturnType<MCPAdapter["fetchContext"]>>) {
  const ruleMap = new Map<string, (typeof base.componentRules)[number]>();
  for (const rule of base.componentRules) {
    ruleMap.set(rule.name, rule);
  }
  for (const rule of next.componentRules) {
    ruleMap.set(rule.name, rule);
  }
  return {
    contextVersion: `${base.contextVersion}+${next.contextVersion}`,
    componentRules: Array.from(ruleMap.values())
  };
}

function summarizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 120) || "Semantic v2 fallback snapshot.";
}

function primaryButtonClassName(prompt: string): string {
  const colors = extractStyleTokens(prompt).colors;
  if (colors.some((color) => ["blue", "sky", "cyan", "indigo"].includes(color))) {
    return "bg-blue-600 text-white hover:bg-blue-700";
  }
  if (colors.some((color) => ["green", "emerald", "teal"].includes(color))) {
    return "bg-emerald-600 text-white hover:bg-emerald-700";
  }
  if (colors.some((color) => ["amber", "orange", "yellow"].includes(color))) {
    return "bg-amber-500 text-slate-950 hover:bg-amber-400";
  }
  return "";
}

function buildPricingFallbackSnapshotV2(prompt: string): UITreeSnapshotV2 {
  return {
    state: {
      features: [
        { id: "f1", label: "Unlimited projects" },
        { id: "f2", label: "Priority support" },
        { id: "f3", label: "Team collaboration" }
      ]
    },
    tree: {
      id: "root",
      type: "Card",
      props: { className: "w-full max-w-lg border shadow-sm" },
      children: [
        {
          id: "header",
          type: "CardHeader",
          children: [
            { id: "eyebrow", type: "Badge", props: { variant: "secondary" }, children: ["Most Popular"] },
            { id: "title", type: "CardTitle", children: ["Pro Plan"] },
            {
              id: "description",
              type: "CardDescription",
              children: ["Designed for startups and product teams moving quickly."]
            }
          ]
        },
        { id: "divider", type: "Separator", children: [] },
        {
          id: "content",
          type: "CardContent",
          children: [
            {
              id: "price-block",
              type: "Stack",
              props: { direction: "vertical", gap: "gap-1", className: "mb-6" },
              children: [
                { id: "price", type: "Text", props: { className: "text-4xl font-semibold tracking-tight" }, children: ["$29/mo"] },
                { id: "price-note", type: "Text", props: { className: "text-sm text-muted-foreground" }, children: ["Simple monthly billing"] }
              ]
            },
            {
              id: "feature-row",
              type: "Stack",
              repeat: { statePath: "/features", key: "id" },
              props: { direction: "horizontal", gap: "gap-3", className: "items-center py-1" },
              children: [
                { id: "feature-bullet", type: "Badge", props: { variant: "outline" }, children: ["+"] },
                { id: "feature-text", type: "Text", props: { text: { $item: "label" }, className: "text-sm" }, children: [] }
              ]
            }
          ]
        },
        {
          id: "footer",
          type: "CardFooter",
          props: { className: "flex flex-col gap-3 sm:flex-row" },
          children: [
            {
              id: "primary-cta",
              type: "Button",
              props: { className: `w-full sm:flex-1 ${primaryButtonClassName(prompt)}`.trim() },
              children: ["Start Free Trial"]
            },
            {
              id: "secondary-cta",
              type: "Button",
              props: { variant: "outline", className: "w-full sm:flex-1" },
              children: ["View Docs"]
            }
          ]
        }
      ]
    }
  };
}

function buildFormFallbackSnapshotV2(prompt: string): UITreeSnapshotV2 {
  return {
    state: {
      form: {
        name: "",
        email: "",
        message: "",
        accepted: false
      }
    },
    tree: {
      id: "root",
      type: "Card",
      props: { className: "w-full max-w-xl border shadow-sm" },
      children: [
        {
          id: "header",
          type: "CardHeader",
          children: [
            { id: "title", type: "CardTitle", children: ["Contact Us"] },
            { id: "description", type: "CardDescription", children: [summarizePrompt(prompt)] }
          ]
        },
        { id: "divider", type: "Separator", children: [] },
        {
          id: "content",
          type: "CardContent",
          children: [
            {
              id: "fields",
              type: "Stack",
              props: { direction: "vertical", gap: "gap-3" },
              children: [
                { id: "name", type: "Input", props: { placeholder: "Name", value: { $bindState: "/form/name" } }, children: [] },
                { id: "email", type: "Input", props: { placeholder: "Email", value: { $bindState: "/form/email" } }, children: [] },
                { id: "message", type: "Textarea", props: { placeholder: "Message", value: { $bindState: "/form/message" }, rows: 5 }, children: [] },
                {
                  id: "accepted",
                  type: "Checkbox",
                  props: { label: "I agree to be contacted", checked: { $bindState: "/form/accepted" } },
                  children: []
                }
              ]
            }
          ]
        },
        {
          id: "footer",
          type: "CardFooter",
          props: { className: "flex flex-col gap-3 sm:flex-row" },
          children: [
            {
              id: "submit",
              type: "Button",
              props: { className: `w-full sm:flex-1 ${primaryButtonClassName(prompt)}`.trim() },
              on: { press: { action: "validateForm", params: { path: "/form", required: ["name", "email", "message"] } } },
              children: ["Send Message"]
            },
            {
              id: "secondary",
              type: "Button",
              props: { variant: "outline", className: "w-full sm:flex-1" },
              children: ["View Docs"]
            }
          ]
        }
      ]
    }
  };
}

function buildDashboardFallbackSnapshotV2(prompt: string): UITreeSnapshotV2 {
  return {
    state: {
      metrics: [
        { id: "m1", label: "MRR", value: "$42k" },
        { id: "m2", label: "Active Users", value: "18.4k" },
        { id: "m3", label: "Churn", value: "1.8%" }
      ]
    },
    tree: {
      id: "root",
      type: "Card",
      props: { className: "w-full max-w-2xl border shadow-sm" },
      children: [
        {
          id: "header",
          type: "CardHeader",
          children: [
            { id: "title", type: "CardTitle", children: ["Operations Dashboard"] },
            { id: "description", type: "CardDescription", children: [summarizePrompt(prompt)] }
          ]
        },
        {
          id: "content",
          type: "CardContent",
          children: [
            {
              id: "metric-row",
              type: "Stack",
              repeat: { statePath: "/metrics", key: "id" },
              props: {
                direction: "horizontal",
                gap: "gap-4",
                className: "items-center justify-between rounded-lg border px-4 py-3"
              },
              children: [
                { id: "metric-label", type: "Text", props: { text: { $item: "label" }, className: "text-sm text-muted-foreground" }, children: [] },
                { id: "metric-value", type: "Text", props: { text: { $item: "value" }, className: "text-lg font-semibold" }, children: [] }
              ]
            }
          ]
        },
        {
          id: "footer",
          type: "CardFooter",
          children: [
            {
              id: "refresh",
              type: "Button",
              props: { className: primaryButtonClassName(prompt) },
              children: ["Refresh"]
            }
          ]
        }
      ]
    }
  };
}

function buildHeroFallbackSnapshotV2(prompt: string): UITreeSnapshotV2 {
  return {
    tree: {
      id: "root",
      type: "Card",
      props: { className: "w-full max-w-3xl border shadow-sm" },
      children: [
        {
          id: "content",
          type: "CardContent",
          children: [
            {
              id: "hero-stack",
              type: "Stack",
              props: { direction: "vertical", gap: "gap-4", className: "py-8" },
              children: [
                { id: "title", type: "CardTitle", children: ["Ship polished UIs faster"] },
                { id: "description", type: "CardDescription", children: [summarizePrompt(prompt)] },
                {
                  id: "actions",
                  type: "Stack",
                  props: { direction: "horizontal", gap: "gap-3" },
                  children: [
                    { id: "primary", type: "Button", props: { className: primaryButtonClassName(prompt) }, children: ["Get Started"] },
                    { id: "secondary", type: "Button", props: { variant: "outline" }, children: ["Explore Docs"] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function buildGenericFallbackSnapshotV2(prompt: string): UITreeSnapshotV2 {
  return {
    state: {
      details: [
        { id: "d1", text: "Stable fallback output" },
        { id: "d2", text: "Valid v2 semantics" }
      ]
    },
    tree: {
      id: "root",
      type: "Card",
      props: { className: "w-full max-w-lg border shadow-sm" },
      children: [
        {
          id: "header",
          type: "CardHeader",
          children: [
            { id: "title", type: "CardTitle", children: ["Generated UI"] },
            { id: "description", type: "CardDescription", children: [summarizePrompt(prompt)] }
          ]
        },
        {
          id: "content",
          type: "CardContent",
          children: [
            {
              id: "items",
              type: "Stack",
              repeat: { statePath: "/details", key: "id" },
              props: { direction: "vertical", gap: "gap-2" },
              children: [
                {
                  id: "item-text",
                  type: "Text",
                  props: { text: { $item: "text" }, className: "text-sm" },
                  children: []
                }
              ]
            }
          ]
        },
        {
          id: "footer",
          type: "CardFooter",
          children: [
            { id: "cta", type: "Button", props: { className: primaryButtonClassName(prompt) }, children: ["Continue"] }
          ]
        }
      ]
    }
  };
}

function buildFallbackSnapshotV2(prompt: string): UITreeSnapshotV2 {
  switch (detectPromptPack(prompt)) {
    case "pricing-card":
      return buildPricingFallbackSnapshotV2(prompt);
    case "form":
      return buildFormFallbackSnapshotV2(prompt);
    case "dashboard":
      return buildDashboardFallbackSnapshotV2(prompt);
    case "hero":
      return buildHeroFallbackSnapshotV2(prompt);
    default:
      return buildGenericFallbackSnapshotV2(prompt);
  }
}

function cloneSpecV2(spec: UISpecV2): UISpecV2 {
  return {
    root: spec.root,
    elements: Object.fromEntries(
      Object.entries(spec.elements).map(([id, element]) => [
        id,
        {
          ...element,
          props: { ...element.props },
          children: [...element.children],
          ...(element.slots ? { slots: Object.fromEntries(Object.entries(element.slots).map(([name, ids]) => [name, [...ids]])) } : {}),
          ...(element.repeat ? { repeat: { ...element.repeat } } : {}),
          ...(element.on ? { on: { ...element.on } } : {}),
          ...(element.watch ? { watch: { ...element.watch } } : {})
        }
      ])
    ),
    ...(spec.state !== undefined ? { state: spec.state } : {})
  };
}

function createAutoElementId(spec: UISpecV2, base: string): string {
  let index = 1;
  let candidate = `auto_${base}`;
  while (spec.elements[candidate]) {
    candidate = `auto_${base}_${index}`;
    index += 1;
  }
  return candidate;
}

function autoFixPackSpecV2(spec: UISpecV2, prompt: string): { spec: UISpecV2; fixes: string[] } {
  const pack = detectPromptPack(prompt);
  const root = spec.elements[spec.root];
  if (!root || root.type !== "Card") {
    return { spec, fixes: [] };
  }

  const sectionTypes = new Set(["CardHeader", "CardContent", "CardFooter"]);
  const headerCandidateTypes = new Set(["CardTitle", "CardDescription", "Badge"]);
  const shouldPreferFooter = pack === "pricing-card" || pack === "form" || pack === "dashboard";

  const fixed = cloneSpecV2(spec);
  const fixedRoot = fixed.elements[fixed.root];
  if (!fixedRoot) {
    return { spec, fixes: [] };
  }
  const rootChildren = [...fixedRoot.children];
  const looseChildren = rootChildren.filter((id) => !sectionTypes.has(fixed.elements[id]?.type ?? ""));
  const fixes: string[] = [];

  const existingHeaders = rootChildren.filter((id) => fixed.elements[id]?.type === "CardHeader");
  const existingContents = rootChildren.filter((id) => fixed.elements[id]?.type === "CardContent");
  const existingFooters = rootChildren.filter((id) => fixed.elements[id]?.type === "CardFooter");

  const headerCandidates = existingHeaders.length === 0
    ? looseChildren.filter((id) => headerCandidateTypes.has(fixed.elements[id]?.type ?? ""))
    : [];

  const footerCandidates = shouldPreferFooter && existingFooters.length === 0
    ? looseChildren.filter((id) => fixed.elements[id]?.type === "Button")
    : [];

  const movedIds = new Set<string>([...headerCandidates, ...footerCandidates]);
  const contentCandidates = existingContents.length === 0
    ? looseChildren.filter((id) => !movedIds.has(id))
    : [];

  let newHeaderId: string | null = null;
  let newContentId: string | null = null;
  let newFooterId: string | null = null;

  if (headerCandidates.length > 0) {
    newHeaderId = createAutoElementId(fixed, "header");
    fixed.elements[newHeaderId] = {
      type: "CardHeader",
      props: {},
      children: headerCandidates
    };
    fixes.push(`Wrapped ${headerCandidates.length} direct root node(s) into CardHeader.`);
  }

  if (contentCandidates.length > 0) {
    newContentId = createAutoElementId(fixed, "content");
    fixed.elements[newContentId] = {
      type: "CardContent",
      props: {},
      children: contentCandidates
    };
    fixes.push(`Wrapped ${contentCandidates.length} direct root node(s) into CardContent.`);
  }

  if (footerCandidates.length > 0) {
    newFooterId = createAutoElementId(fixed, "footer");
    fixed.elements[newFooterId] = {
      type: "CardFooter",
      props: {},
      children: footerCandidates
    };
    fixes.push(`Wrapped ${footerCandidates.length} direct root button(s) into CardFooter.`);
  }

  if (fixes.length === 0) {
    return { spec, fixes: [] };
  }

  fixedRoot.children = [
    ...existingHeaders,
    ...(newHeaderId ? [newHeaderId] : []),
    ...existingContents,
    ...(newContentId ? [newContentId] : []),
    ...existingFooters,
    ...(newFooterId ? [newFooterId] : [])
  ];

  return {
    spec: fixed,
    fixes
  };
}

async function recordFailureSafely(
  deps: OrchestratorDepsV2,
  request: GenerateRequestV2,
  generationId: string,
  warnings: Array<{ code: string; message: string }>,
  patchCount: number,
  startedAt: number,
  errorCode: string
): Promise<void> {
  try {
    await deps.persistence.recordGenerationFailure({
      threadId: request.threadId,
      generationId,
      warningCount: warnings.length,
      patchCount,
      durationMs: Math.max(0, Date.now() - startedAt),
      errorCode
    });
  } catch {
    // Failure logging must never break the generation stream.
  }
}

export async function* runGenerationV2(
  request: GenerateRequestV2,
  deps: OrchestratorDepsV2
): AsyncGenerator<StreamEventV2> {
  const generationId = randomUUID();
  const startedAt = Date.now();
  const warnings: Array<{ code: string; message: string }> = [];
  let patchCount = 0;
  let modelOutputText = "";

  try {
    const threadBundle = await deps.persistence.getThreadBundleV2(request.threadId);
    if (!threadBundle) {
      yield {
        type: "error",
        generationId,
        code: "THREAD_NOT_FOUND",
        message: `Thread '${request.threadId}' not found.`
      };
      return;
    }

    const baseVersion = await deps.persistence.getVersionV2(request.threadId, request.baseVersionId);
    if (request.baseVersionId && !baseVersion) {
      await recordFailureSafely(
        deps,
        request,
        generationId,
        warnings,
        patchCount,
        startedAt,
        "BASE_VERSION_CONFLICT"
      );
      yield {
        type: "error",
        generationId,
        code: "BASE_VERSION_CONFLICT",
        message: `Base version '${request.baseVersionId}' was not found for thread '${request.threadId}'.`
      };
      return;
    }

    let canonicalSpec: UISpecV2 =
      baseVersion?.specSnapshot ??
      ({
        root: "",
        elements: {}
      } satisfies UISpecV2);

    yield { type: "status", generationId, stage: "pass1_extract_components_v2" };
    const pass1 = await deps.model.extractComponents({
      prompt: request.prompt,
      previousSpec: baseVersion?.specSnapshot ?? null
    });

    yield { type: "status", generationId, stage: "mcp_fetch_context_v2" };
    const mcpContext = await deps.mcp.fetchContext(pass1.components);
    let runtimeContext = mcpContext;
    const allowedComponentTypes = getAllowedComponentTypeSetV2();

    const minimumElementFloor = estimatePromptPackMinElements(
      {
        prompt: request.prompt,
        previousSpec: baseVersion?.specSnapshot ?? null,
        componentContext: mcpContext
      },
      true
    );
    const constraintSet = buildConstraintSetV2({
      prompt: request.prompt,
      pass1
    });

    let acceptedCandidate = false;
    let sawAnyCandidate = false;
    let lastValidationIssues: Array<{ code: string; message: string }> = [];
    const rejectedSignatures = new Set<string>();
    let acceptedSnapshotForPersistence: UITreeSnapshotV2 | null = null;
    let fallbackApplied = false;

    for (let attempt = 1; attempt <= MAX_PASS2_ATTEMPTS; attempt += 1) {
      yield {
        type: "status",
        generationId,
        stage: attempt === 1 ? "pass2_stream_design_v2" : `pass2_stream_design_v2_retry_${attempt}`
      };

      const streamPrompt =
        attempt === 1
          ? request.prompt
          : buildRetryPromptWithValidationFeedback(request.prompt, lastValidationIssues, attempt);

      const streamSource =
        deps.model.streamDesignV2?.({
          prompt: streamPrompt,
          previousSpec: baseVersion?.specSnapshot ?? null,
          componentContext: runtimeContext
        }) ??
        deps.model.streamDesign({
          prompt: streamPrompt,
          previousSpec: baseVersion?.specSnapshot ?? null,
          componentContext: runtimeContext
        });

      let acceptedOnAttempt = false;
      let observedObjectOnAttempt = false;
      let buffer = "";
      const processedObjectTexts = new Set<string>();
      let attemptFailureIssues: Array<{ code: string; message: string }> = [];

      try {
        for await (const chunk of streamSource) {
          modelOutputText += chunk;
          buffer += chunk;
          const extracted = extractCompleteJsonObjects(buffer);
          buffer = extracted.remainder;
          const recoveredFromBuffer = extractRecoverableJsonObjects(buffer);
          const candidateObjects = [...extracted.objects, ...recoveredFromBuffer];

          for (const objectTextRaw of candidateObjects) {
            const objectText = objectTextRaw.trim();
            if (!objectText || processedObjectTexts.has(objectText)) {
              continue;
            }
            processedObjectTexts.add(objectText);
            observedObjectOnAttempt = true;
            const toolCall = parseModelToolCall(objectText);
            if (toolCall) {
              const fetched = await deps.mcp.fetchContext(toolCall.components);
              runtimeContext = mergeMcpContexts(runtimeContext, fetched);
              lastValidationIssues = [
                {
                  code: "V2_TOOL_CALL_EXECUTED",
                  message: `Executed tool call '${toolCall.tool}' for components: ${toolCall.components.join(", ")}`
                }
              ];
              continue;
            }

            const snapshot = parseCandidateSnapshotV2(objectText);
            if (!snapshot) {
              continue;
            }

            sawAnyCandidate = true;
            const initialCandidateSpec = normalizeTreeToSpecV2(snapshot);
            let candidateSpec = initialCandidateSpec;
            const candidateAcceptedWarnings: Array<{ code: string; message: string }> = [];
            let usedStructuralAutofix = false;
            let structuralSchemaIssues = validateStructuralSpecV2(candidateSpec).issues.map((issue) => ({
              code: issue.code,
              message: issue.message
            }));

            if (structuralSchemaIssues.length > 0) {
              const fixed = autoFixStructuralSpecV2(candidateSpec);
              if (fixed.fixes.length > 0) {
                const fixedStructural = validateStructuralSpecV2(fixed.spec);
                if (fixedStructural.valid) {
                  candidateSpec = fixed.spec;
                  usedStructuralAutofix = true;
                  structuralSchemaIssues = [];
                  candidateAcceptedWarnings.push({
                    code: "V2_AUTOFIX_APPLIED",
                    message: `Applied structural auto-fix before semantic validation: ${fixed.fixes.join(" ")}`
                  });
                } else {
                  structuralSchemaIssues = fixedStructural.issues.map((issue) => ({
                    code: issue.code,
                    message: issue.message
                  }));
                }
              }
            }

            const packFix = autoFixPackSpecV2(candidateSpec, request.prompt);
            if (packFix.fixes.length > 0) {
              candidateSpec = packFix.spec;
              candidateAcceptedWarnings.push({
                code: "V2_PACK_AUTOFIX_APPLIED",
                message: `Applied prompt-pack auto-fix before semantic validation: ${packFix.fixes.join(" ")}`
              });
            }

            const presentation = applyPresentationDefaultsV2(candidateSpec, request.prompt);
            candidateSpec = presentation.spec;

            const validation = validateSpecV2(candidateSpec, { allowedComponentTypes });
            const semanticIssues = validation.valid
              ? []
              : validation.issues.map((issue) => ({ code: issue.code, message: issue.message }));
            const constraintIssues = validateConstraintSetV2(candidateSpec, constraintSet).map((issue) => ({
              code: issue.code,
              message: issue.message
            }));
            const isUsableCandidate = isUsableSpecForPromptPackV2(candidateSpec, request.prompt);
            const sparseIssues =
              Object.keys(candidateSpec.elements).length < minimumElementFloor && !isUsableCandidate
                ? [
                    {
                      code: "V2_SPARSE_OUTPUT",
                      message: `Output has ${Object.keys(candidateSpec.elements).length} elements; minimum expected is ${minimumElementFloor}.`
                    }
                  ]
                : [];
            const allIssues = [
              ...structuralSchemaIssues,
              ...semanticIssues,
              ...constraintIssues,
              ...sparseIssues
            ];

            if (allIssues.length > 0) {
              const signature = buildStructuralSignature(candidateSpec);
              if (rejectedSignatures.has(signature)) {
                allIssues.push({
                  code: "V2_NO_STRUCTURAL_PROGRESS",
                  message: "Candidate structure repeated without meaningful progress across retries."
                });
              }
              rejectedSignatures.add(signature);
            }

            if (allIssues.length > 0) {
              lastValidationIssues = allIssues;
              attemptFailureIssues = allIssues;
              continue;
            }

            for (const warningIssue of candidateAcceptedWarnings) {
              const warning = {
                type: "warning" as const,
                generationId,
                code: warningIssue.code,
                message: warningIssue.message
              };
              warnings.push({ code: warning.code, message: warning.message });
              yield warning;
            }

            const patches = diffSpecs(canonicalSpec, candidateSpec);
            for (const patch of patches) {
              patchCount += 1;
              yield {
                type: "patch",
                generationId,
                patch
              };
            }

            canonicalSpec = candidateSpec;
            acceptedOnAttempt = true;
            acceptedCandidate = true;
            acceptedSnapshotForPersistence =
              usedStructuralAutofix || packFix.fixes.length > 0 || presentation.changed ? null : snapshot;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Pass 2 stream failed unexpectedly.";
        attemptFailureIssues = [
          {
            code: "PASS2_STREAM_FAILED",
            message
          }
        ];
        lastValidationIssues = attemptFailureIssues;
      }

      if (!observedObjectOnAttempt && !acceptedOnAttempt && lastValidationIssues.length === 0) {
        lastValidationIssues = [
          {
            code: "V2_NO_VALID_SNAPSHOT",
            message: "No valid JSON snapshots were produced in this attempt."
          }
        ];
        attemptFailureIssues = lastValidationIssues;
      }

      if (acceptedOnAttempt) {
        break;
      }

      if (attemptFailureIssues.length > 0) {
        lastValidationIssues = attemptFailureIssues;
      }
    }

    if (!acceptedCandidate) {
      const emittedCodes = new Set<string>();
      for (const issue of lastValidationIssues) {
        if (emittedCodes.has(issue.code)) {
          continue;
        }
        emittedCodes.add(issue.code);
        const warning = {
          type: "warning" as const,
          generationId,
          code: issue.code,
          message: issue.message
        };
        warnings.push({ code: warning.code, message: warning.message });
        yield warning;
      }
    }

    if (!acceptedCandidate) {
      const fallbackSnapshot = buildFallbackSnapshotV2(request.prompt);
      const fallbackSpec = applyPresentationDefaultsV2(normalizeTreeToSpecV2(fallbackSnapshot), request.prompt).spec;
      const validation = validateSpecV2(fallbackSpec, { allowedComponentTypes });

      if (!validation.valid) {
        await recordFailureSafely(
          deps,
          request,
          generationId,
          warnings,
          patchCount,
          startedAt,
          "V2_FALLBACK_INVALID"
        );
        yield {
          type: "error",
          generationId,
          code: "V2_FALLBACK_INVALID",
          message: "Fallback spec failed semantic validation."
        };
        return;
      }

      const fallbackWarning = {
        type: "warning" as const,
        generationId,
        code: "FALLBACK_APPLIED",
        message:
          sawAnyCandidate || lastValidationIssues.length > 0
            ? `Applied deterministic v2 fallback UI after unsuccessful retries. Last issue: ${lastValidationIssues[0]?.code ?? "unknown"}.`
            : "Applied deterministic v2 fallback UI."
      };
      warnings.push({ code: fallbackWarning.code, message: fallbackWarning.message });
      yield fallbackWarning;
      fallbackApplied = true;

      const patches = diffSpecs(canonicalSpec, fallbackSpec);
      for (const patch of patches) {
        patchCount += 1;
        yield {
          type: "patch",
          generationId,
          patch
        };
      }
      canonicalSpec = fallbackSpec;
      acceptedCandidate = true;
      acceptedSnapshotForPersistence = fallbackSnapshot;
    }

    if (!acceptedCandidate) {
      await recordFailureSafely(
        deps,
        request,
        generationId,
        warnings,
        patchCount,
        startedAt,
        "NO_VALID_CANDIDATE_V2"
      );
      yield {
        type: "error",
        generationId,
        code: "NO_VALID_CANDIDATE_V2",
        message: "No valid semantic v2 snapshot was produced."
      };
      return;
    }

    const hash = specHash(canonicalSpec);
    const assistantResponseText = JSON.stringify(acceptedSnapshotForPersistence ?? canonicalSpec, null, 2);
    const assistantReasoningText = [
      `Generated semantic v2 UI for prompt "${request.prompt.slice(0, 120)}".`,
      `Intent confidence: ${pass1.confidence.toFixed(2)}.`,
      `MCP context ${runtimeContext.contextVersion} supplied ${runtimeContext.componentRules.length} rule(s).`,
      `Applied ${patchCount} patch(es); warnings: ${warnings.length}.`,
      `Final source: ${fallbackApplied ? "deterministic fallback" : "model candidate"}.`,
      `Final spec has ${Object.keys(canonicalSpec.elements).length} element(s).`
    ].join(" ");

    const persisted = await deps.persistence.persistGenerationV2({
      threadId: request.threadId,
      generationId,
      prompt: request.prompt,
      assistantResponseText,
      assistantReasoningText,
      baseVersionId: request.baseVersionId,
      specSnapshot: canonicalSpec,
      specHash: hash,
      mcpContextUsed: pass1.components,
      warnings,
      patchCount,
      durationMs: Math.max(0, Date.now() - startedAt)
    });

    const promptTokens = tokenEstimate(request.prompt);
    const completionTokens = tokenEstimate(modelOutputText);
    yield {
      type: "usage",
      generationId,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };

    yield {
      type: "done",
      generationId,
      versionId: persisted.version.versionId,
      specHash: hash
    };
  } catch (error) {
    await recordFailureSafely(
      deps,
      request,
      generationId,
      warnings,
      patchCount,
      startedAt,
      "GENERATION_EXCEPTION"
    );
    yield {
      type: "error",
      generationId,
      code: "GENERATION_EXCEPTION",
      message: error instanceof Error ? error.message : "Unknown generation error."
    };
  }
}
