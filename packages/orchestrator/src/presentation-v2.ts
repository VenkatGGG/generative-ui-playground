import type { UISpecV2, UISpecElementV2 } from "@repo/contracts";
import { detectPromptPack, extractStyleTokens } from "@repo/integrations";

type PromptPack = ReturnType<typeof detectPromptPack>;

interface PresentationResult {
  spec: UISpecV2;
  changed: boolean;
}

function dedupeClasses(input: string): string {
  const tokens = input
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return Array.from(new Set(tokens)).join(" ");
}

function mergeClassNames(existing: unknown, defaults: string): { className?: string; changed: boolean } {
  const current = typeof existing === "string" ? existing.trim() : "";
  if (!defaults.trim()) {
    return current ? { className: current, changed: false } : { changed: false };
  }

  const merged = dedupeClasses([current, defaults].filter(Boolean).join(" "));
  if (!merged) {
    return { changed: false };
  }

  return {
    className: merged,
    changed: merged !== current
  };
}

function buildParentMap(spec: UISpecV2): Map<string, string> {
  const parents = new Map<string, string>();
  for (const [id, element] of Object.entries(spec.elements)) {
    for (const childId of element.children) {
      parents.set(childId, id);
    }
    const slots = element.slots ?? {};
    for (const childIds of Object.values(slots)) {
      for (const childId of childIds) {
        parents.set(childId, id);
      }
    }
  }
  return parents;
}

function collectElementText(spec: UISpecV2, elementId: string, seen = new Set<string>()): string {
  if (seen.has(elementId)) {
    return "";
  }
  seen.add(elementId);

  const element = spec.elements[elementId];
  if (!element) {
    return "";
  }

  if (element.type === "Text" && typeof element.props.text === "string") {
    return element.props.text;
  }

  return element.children.map((childId) => collectElementText(spec, childId, seen)).join(" ").trim();
}

function inferAccentClass(prompt: string): string {
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
  return "bg-slate-900 text-white hover:bg-slate-800";
}

function rootCardDefaults(pack: PromptPack): string {
  switch (pack) {
    case "pricing-card":
      return "mx-auto w-full max-w-lg border-slate-200/80 shadow-lg shadow-slate-950/5";
    case "form":
      return "mx-auto w-full max-w-xl border-slate-200/80 shadow-lg shadow-slate-950/5";
    case "dashboard":
      return "w-full max-w-2xl border-slate-200/80 shadow-lg shadow-slate-950/5";
    case "hero":
      return "w-full border-slate-200/80 shadow-xl shadow-slate-950/5";
    default:
      return "w-full border-slate-200/80 shadow-sm";
  }
}

function elementDefaults(
  spec: UISpecV2,
  elementId: string,
  parents: Map<string, string>,
  prompt: string
): { className?: string; variant?: string } {
  const element = spec.elements[elementId];
  if (!element) {
    return {};
  }
  const pack = detectPromptPack(prompt);
  const text = collectElementText(spec, elementId).toLowerCase();
  const parentId = parents.get(elementId);
  const parent = parentId ? spec.elements[parentId] : null;

  switch (element.type) {
    case "Card":
      return { className: rootCardDefaults(pack) };
    case "CardHeader":
      return { className: "space-y-2 pb-4" };
    case "CardTitle":
      return { className: "text-xl font-semibold tracking-tight text-slate-950" };
    case "CardDescription":
      return { className: "text-sm leading-6 text-slate-600" };
    case "CardContent":
      return { className: "space-y-4" };
    case "CardFooter":
      return { className: "flex flex-wrap gap-3 pt-2" };
    case "Stack":
      if (elementId.includes("feature") || elementId.includes("metric") || elementId.includes("row")) {
        return { className: "gap-3" };
      }
      return { className: "gap-4" };
    case "Button": {
      const secondary = /(view|docs|details|export|learn more|secondary|cancel)/.test(text);
      return {
        className: secondary
          ? "min-w-[140px]"
          : `min-w-[160px] ${inferAccentClass(prompt)}`.trim(),
        variant: secondary ? "outline" : "default"
      };
    }
    case "Badge":
      if (/^\+\d+%/.test(text)) {
        return { className: "border-blue-200 bg-blue-50 text-blue-700", variant: "outline" };
      }
      return { className: "w-fit" };
    case "Input":
    case "Textarea":
    case "Select":
      return { className: "w-full" };
    case "Checkbox":
      return { className: "pt-1" };
    case "Separator":
      return { className: "my-2" };
    case "Text":
      if (/^\$\d+/.test(text)) {
        return { className: "text-4xl font-semibold tracking-tight text-slate-950" };
      }
      if (/^\+\d+%/.test(text)) {
        return { className: "text-sm font-medium text-blue-700" };
      }
      if (parent?.type === "CardDescription") {
        return { className: "text-sm leading-6 text-slate-600" };
      }
      if (parent?.type === "CardTitle") {
        return { className: "text-xl font-semibold tracking-tight text-slate-950" };
      }
      return {};
    default:
      return {};
  }
}

function isEmptyRecord(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0;
}

function sanitizeElement(element: UISpecElementV2): { element: UISpecElementV2; changed: boolean } {
  let changed = false;
  const sanitized: UISpecElementV2 = {
    ...element,
    props: { ...element.props }
  };

  if (sanitized.visible === true) {
    delete sanitized.visible;
    changed = true;
  }
  if (isEmptyRecord(sanitized.watch)) {
    delete sanitized.watch;
    changed = true;
  }
  if (isEmptyRecord(sanitized.on)) {
    delete sanitized.on;
    changed = true;
  }
  if (sanitized.slots && Object.keys(sanitized.slots).length === 0) {
    delete sanitized.slots;
    changed = true;
  }

  return { element: sanitized, changed };
}

export function applyPresentationDefaultsV2(spec: UISpecV2, prompt: string): PresentationResult {
  const parents = buildParentMap(spec);
  let changed = false;
  const elements = Object.fromEntries(
    Object.entries(spec.elements).map(([id, element]) => {
      const sanitized = sanitizeElement(element);
      let nextElement = sanitized.element;
      changed ||= sanitized.changed;

      const defaults = elementDefaults(spec, id, parents, prompt);
      const mergedClasses = mergeClassNames(nextElement.props.className, defaults.className ?? "");
      const nextProps = { ...nextElement.props };

      if (mergedClasses.className) {
        nextProps.className = mergedClasses.className;
      }
      changed ||= mergedClasses.changed;

      if (!nextProps.variant && defaults.variant) {
        nextProps.variant = defaults.variant;
        changed = true;
      }

      nextElement = {
        ...nextElement,
        props: nextProps
      };

      return [id, nextElement];
    })
  );

  return {
    spec: changed
      ? {
          ...spec,
          elements
        }
      : spec,
    changed
  };
}
