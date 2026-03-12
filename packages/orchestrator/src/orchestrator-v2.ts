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
  type ExtractComponentsResult,
  getFallbackPromptComponents,
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

interface FormFieldBlueprint {
  key: string;
  id: string;
  type: "Input" | "Textarea" | "Select" | "Checkbox";
  placeholder?: string;
  label?: string;
  inputType?: string;
  options?: Array<{ label: string; value: string }>;
}

interface FormBlueprint {
  title: string;
  description: string;
  submitLabel: string;
  secondaryLabel?: string;
  fields: FormFieldBlueprint[];
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function fieldLabelForKey(key: string): string {
  switch (key) {
    case "displayName":
      return "Display name";
    case "email":
      return "Email";
    case "password":
      return "Password";
    case "message":
      return "Message";
    case "marketingOptIn":
      return "I want product updates";
    case "newsletter":
      return "Subscribe to newsletter";
    case "consent":
      return "I agree to updates";
    case "phone":
      return "Phone";
    case "company":
      return "Company";
    case "role":
      return "Role";
    case "name":
      return "Name";
    default:
      return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
  }
}

function fieldPlaceholderForKey(key: string): string | undefined {
  switch (key) {
    case "displayName":
      return "Display name";
    case "email":
      return "you@company.com";
    case "password":
      return "Enter your password";
    case "message":
      return "Tell us a bit more...";
    case "phone":
      return "Phone number";
    case "company":
      return "Company name";
    case "name":
      return "Your name";
    default:
      return undefined;
  }
}

function collectElementTextFromSpec(spec: UISpecV2, elementId: string, seen = new Set<string>()): string {
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

  return element.children
    .map((childId) => collectElementTextFromSpec(spec, childId, seen))
    .filter((value) => value.length > 0)
    .join(" ")
    .trim();
}

function firstTextFromTypes(spec: UISpecV2, types: string[]): string | null {
  for (const [id, element] of Object.entries(spec.elements)) {
    if (!types.includes(element.type)) {
      continue;
    }
    const text = collectElementTextFromSpec(spec, id);
    if (text) {
      return text;
    }
  }
  return null;
}

function extractButtonTexts(spec: UISpecV2): string[] {
  return Object.entries(spec.elements)
    .filter(([, element]) => element.type === "Button")
    .map(([id]) => collectElementTextFromSpec(spec, id))
    .filter((text) => text.length > 0);
}

function inferFormFieldKey(raw: string, type: FormFieldBlueprint["type"]): string {
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ");
  if (normalized.includes("display name")) {
    return "displayName";
  }
  if (normalized.includes("email")) {
    return "email";
  }
  if (normalized.includes("password")) {
    return "password";
  }
  if (normalized.includes("phone")) {
    return "phone";
  }
  if (normalized.includes("company")) {
    return "company";
  }
  if (normalized.includes("marketing") || normalized.includes("opt in")) {
    return "marketingOptIn";
  }
  if (normalized.includes("newsletter")) {
    return "newsletter";
  }
  if (normalized.includes("consent") || normalized.includes("agree")) {
    return "consent";
  }
  if (normalized.includes("role")) {
    return "role";
  }
  if (normalized.includes("message") || normalized.includes("comment") || normalized.includes("feedback")) {
    return "message";
  }
  if (normalized.includes("name")) {
    return "name";
  }
  return type === "Checkbox" ? "consent" : "field";
}

function inferFormFieldsFromPrompt(prompt: string): FormFieldBlueprint[] {
  const lower = prompt.toLowerCase();
  const descriptors: Array<FormFieldBlueprint & { index: number }> = [];

  const addDescriptor = (
    matcher: RegExp,
    field: Omit<FormFieldBlueprint, "id">,
    id?: string
  ) => {
    const match = matcher.exec(lower);
    if (!match || match.index < 0) {
      return;
    }
    descriptors.push({
      ...field,
      id: id ?? toKebabCase(field.key),
      index: match.index
    });
  };

  addDescriptor(/\bdisplay name\b/, { key: "displayName", type: "Input", placeholder: "Display name" });
  addDescriptor(/\bemail\b/, { key: "email", type: "Input", placeholder: "you@company.com" });
  addDescriptor(/\bpassword\b/, { key: "password", type: "Input", placeholder: "Enter your password", inputType: "password" });
  addDescriptor(/\bphone\b/, { key: "phone", type: "Input", placeholder: "Phone number" });
  addDescriptor(/\bcompany\b/, { key: "company", type: "Input", placeholder: "Company name" });
  addDescriptor(/\b(role|select)\b/, {
    key: "role",
    type: "Select",
    options: [
      { label: "Developer", value: "developer" },
      { label: "Designer", value: "designer" },
      { label: "Product", value: "product" }
    ]
  });
  addDescriptor(/\b(message|feedback|comment|notes?)\b/, { key: "message", type: "Textarea", placeholder: "Tell us a bit more..." });
  const hasSpecificOptIn = /\b(marketing opt[- ]?in|marketing|newsletter|updates)\b/.test(lower);
  addDescriptor(/\b(marketing opt[- ]?in|marketing|newsletter|updates)\b/, {
    key: "marketingOptIn",
    type: "Checkbox",
    label: "I want product updates"
  });
  if (!hasSpecificOptIn) {
    addDescriptor(/\b(consent|agree|checkbox)\b/, {
      key: "consent",
      type: "Checkbox",
      label: "I agree to updates"
    });
  }
  if (!/\bdisplay name\b/.test(lower)) {
    addDescriptor(/\bname\b/, { key: "name", type: "Input", placeholder: "Your name" });
  }

  const unique = new Map<string, FormFieldBlueprint & { index: number }>();
  for (const descriptor of descriptors.sort((left, right) => left.index - right.index)) {
    if (!unique.has(descriptor.key)) {
      unique.set(descriptor.key, descriptor);
    }
  }

  return Array.from(unique.values()).map(({ index: _index, ...field }) => field);
}

function inferFormFieldsFromSpec(spec: UISpecV2): FormFieldBlueprint[] {
  const fields = new Map<string, FormFieldBlueprint>();

  for (const [id, element] of Object.entries(spec.elements)) {
    if (!["Input", "Textarea", "Select", "Checkbox"].includes(element.type)) {
      continue;
    }

    const placeholder =
      typeof element.props.placeholder === "string" ? element.props.placeholder : undefined;
    const label = typeof element.props.label === "string" ? element.props.label : undefined;
    const inputType = typeof element.props.type === "string" ? element.props.type : undefined;
    const sourceText = [id, placeholder, label].filter((value): value is string => !!value).join(" ");
    const key = inferFormFieldKey(sourceText || id, element.type as FormFieldBlueprint["type"]);
    const nextField: FormFieldBlueprint = {
      key,
      id: toKebabCase(id || key),
      type: element.type as FormFieldBlueprint["type"],
      ...(placeholder ? { placeholder } : {}),
      ...(label ? { label } : {}),
      ...(inputType ? { inputType } : {})
    };

    if (element.type === "Select" && Array.isArray(element.props.options)) {
      const options = (element.props.options as unknown[])
        .filter(
          (entry): entry is { label: string; value: string } =>
            !!entry &&
            typeof entry === "object" &&
            typeof (entry as { label?: unknown }).label === "string" &&
            typeof (entry as { value?: unknown }).value === "string"
        )
        .map((entry) => ({ label: entry.label, value: entry.value }));
      if (options.length > 0) {
        nextField.options = options;
      }
    }

    if (!fields.has(key)) {
      fields.set(key, nextField);
      continue;
    }

    const previous = fields.get(key)!;
    fields.set(key, {
      ...previous,
      ...nextField,
      placeholder: nextField.placeholder ?? previous.placeholder,
      label: nextField.label ?? previous.label,
      inputType: nextField.inputType ?? previous.inputType,
      options: nextField.options ?? previous.options
    });
  }

  return Array.from(fields.values());
}

function inferFormTitle(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\b(account|settings|profile)\b/.test(lower)) {
    return "Account Settings";
  }
  if (/\bcontact\b/.test(lower)) {
    return "Contact Us";
  }
  if (/\b(login|sign in)\b/.test(lower)) {
    return "Sign In";
  }
  if (/\b(sign up|create account|join)\b/.test(lower)) {
    return "Create Account";
  }
  if (/\b(waitlist)\b/.test(lower)) {
    return "Join the Waitlist";
  }
  if (/\b(request access|invite)\b/.test(lower)) {
    return "Request Access";
  }
  return "Form";
}

function inferFormDescription(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\b(account|settings|profile)\b/.test(lower)) {
    return "Manage your account details and preferences.";
  }
  if (/\bcontact\b/.test(lower)) {
    return "Share a few details and we will follow up shortly.";
  }
  if (/\b(login|sign in)\b/.test(lower)) {
    return "Enter your credentials to continue.";
  }
  if (/\b(sign up|create account|join)\b/.test(lower)) {
    return "Tell us a bit about yourself to get started.";
  }
  return summarizePrompt(prompt);
}

function inferPrimaryFormAction(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\bsave changes?\b/.test(lower)) {
    return "Save Changes";
  }
  if (/\b(sign in|login)\b/.test(lower)) {
    return "Sign In";
  }
  if (/\b(sign up|create account)\b/.test(lower)) {
    return "Create Account";
  }
  if (/\b(request invite|request access)\b/.test(lower)) {
    return "Request Invite";
  }
  if (/\b(waitlist|join)\b/.test(lower)) {
    return "Join Waitlist";
  }
  if (/\bcontact\b/.test(lower)) {
    return "Send Message";
  }
  return "Submit";
}

function inferSecondaryFormAction(prompt: string): string | undefined {
  const lower = prompt.toLowerCase();
  if (/\b(cancel)\b/.test(lower)) {
    return "Cancel";
  }
  if (/\b(view docs|docs)\b/.test(lower)) {
    return "View Docs";
  }
  if (/\b(learn more)\b/.test(lower)) {
    return "Learn More";
  }
  return undefined;
}

function buildFormBlueprint(prompt: string, candidateSpec?: UISpecV2): FormBlueprint {
  const promptFields = inferFormFieldsFromPrompt(prompt);
  const candidateFields = candidateSpec ? inferFormFieldsFromSpec(candidateSpec) : [];
  const fieldMap = new Map<string, FormFieldBlueprint>();

  for (const field of promptFields) {
    fieldMap.set(field.key, field);
  }
  for (const field of candidateFields) {
    const previous = fieldMap.get(field.key);
    fieldMap.set(field.key, {
      ...(previous ?? {}),
      ...field,
      placeholder: field.placeholder ?? previous?.placeholder,
      label: field.label ?? previous?.label,
      inputType: field.inputType ?? previous?.inputType,
      options: field.options ?? previous?.options
    } as FormFieldBlueprint);
  }

  if (fieldMap.size === 0) {
    fieldMap.set("email", {
      key: "email",
      id: "email",
      type: "Input",
      placeholder: "you@company.com"
    });
  }

  const title =
    (candidateSpec ? firstTextFromTypes(candidateSpec, ["CardTitle"]) : null) ?? inferFormTitle(prompt);
  const description =
    (candidateSpec ? firstTextFromTypes(candidateSpec, ["CardDescription"]) : null) ??
    inferFormDescription(prompt);

  const buttonTexts = candidateSpec ? extractButtonTexts(candidateSpec) : [];
  const primaryCandidate =
    buttonTexts.find((text) => !/\b(cancel|docs|learn more|secondary|back)\b/i.test(text)) ?? buttonTexts[0];
  const secondaryCandidate = buttonTexts.find((text) =>
    /\b(cancel|docs|learn more|secondary|back)\b/i.test(text)
  );

  return {
    title,
    description,
    submitLabel: primaryCandidate ?? inferPrimaryFormAction(prompt),
    secondaryLabel: secondaryCandidate ?? inferSecondaryFormAction(prompt),
    fields: Array.from(fieldMap.values()).map((field) => ({
      ...field,
      id: field.id || toKebabCase(field.key),
      placeholder: field.placeholder ?? fieldPlaceholderForKey(field.key),
      label: field.label ?? (field.type === "Checkbox" ? fieldLabelForKey(field.key) : undefined),
      options:
        field.type === "Select"
          ? field.options ?? [
              { label: "Option 1", value: "option-1" },
              { label: "Option 2", value: "option-2" }
            ]
          : undefined
    }))
  };
}

function buildFormSnapshotFromBlueprint(blueprint: FormBlueprint): UITreeSnapshotV2 {
  const requiredKeys = blueprint.fields
    .filter((field) => field.type !== "Checkbox")
    .map((field) => field.key);
  const footerChildren = ["submit"];
  if (blueprint.secondaryLabel) {
    footerChildren.push("secondary");
  }

  return {
    state: {
      form: Object.fromEntries(
        blueprint.fields.map((field) => [
          field.key,
          field.type === "Checkbox" ? false : field.type === "Select" ? field.options?.[0]?.value ?? "" : ""
        ])
      )
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
            { id: "title", type: "CardTitle", children: [blueprint.title] },
            { id: "description", type: "CardDescription", children: [blueprint.description] }
          ]
        },
        {
          id: "content",
          type: "CardContent",
          children: [
            {
              id: "fields",
              type: "Stack",
              props: { direction: "vertical", gap: "gap-3" },
              children: blueprint.fields.map((field) => field.id)
            }
          ]
        },
        {
          id: "footer",
          type: "CardFooter",
          props: { className: "flex flex-col gap-3 sm:flex-row" },
          children: footerChildren
        }
      ]
    }
  };
}

function createFormFieldElements(blueprint: FormBlueprint): UIComponentNodeV2[] {
  return blueprint.fields.map((field) => {
    if (field.type === "Checkbox") {
      return {
        id: field.id,
        type: "Checkbox",
        props: {
          label: field.label ?? fieldLabelForKey(field.key),
          checked: { $bindState: `/form/${field.key}` }
        },
        children: []
      } satisfies UIComponentNodeV2;
    }

    if (field.type === "Textarea") {
      return {
        id: field.id,
        type: "Textarea",
        props: {
          placeholder: field.placeholder ?? fieldPlaceholderForKey(field.key),
          value: { $bindState: `/form/${field.key}` },
          rows: 5
        },
        children: []
      } satisfies UIComponentNodeV2;
    }

    if (field.type === "Select") {
      return {
        id: field.id,
        type: "Select",
        props: {
          options:
            field.options ?? [
              { label: "Option 1", value: "option-1" },
              { label: "Option 2", value: "option-2" }
            ],
          value: { $bindState: `/form/${field.key}` }
        },
        children: []
      } satisfies UIComponentNodeV2;
    }

    return {
      id: field.id,
      type: "Input",
      props: {
        ...(field.inputType ? { type: field.inputType } : {}),
        placeholder: field.placeholder ?? fieldPlaceholderForKey(field.key),
        value: { $bindState: `/form/${field.key}` }
      },
      children: []
    } satisfies UIComponentNodeV2;
  });
}

function buildFormSnapshotV2(prompt: string, candidateSpec?: UISpecV2): UITreeSnapshotV2 {
  const blueprint = buildFormBlueprint(prompt, candidateSpec);
  const snapshot = buildFormSnapshotFromBlueprint(blueprint);
  const fieldElements = createFormFieldElements(blueprint);
  const footerChildren = snapshot.tree.children?.[2];

  if (footerChildren && typeof footerChildren !== "string" && footerChildren.type === "CardFooter") {
    footerChildren.children = [
      {
        id: "submit",
        type: "Button",
        props: { className: `w-full sm:flex-1 ${primaryButtonClassName(prompt)}`.trim() },
        on: {
          press: {
            action: "validateForm",
            params: {
              path: "/form",
              required: blueprint.fields.filter((field) => field.type !== "Checkbox").map((field) => field.key)
            }
          }
        },
        children: [blueprint.submitLabel]
      },
      ...(blueprint.secondaryLabel
        ? [
            {
              id: "secondary",
              type: "Button",
              props: { variant: "outline", className: "w-full sm:flex-1" },
              children: [blueprint.secondaryLabel]
            } satisfies UIComponentNodeV2
          ]
        : [])
    ];
  }

  const fieldsStack = snapshot.tree.children?.[1];
  if (fieldsStack && typeof fieldsStack !== "string" && fieldsStack.type === "CardContent") {
    const stack = fieldsStack.children?.[0];
    if (stack && typeof stack !== "string" && stack.type === "Stack") {
      stack.children = fieldElements;
      fieldsStack.children = [stack];
    }
  }

  return snapshot;
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
  return buildFormSnapshotV2(prompt);
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

function isFormControlBound(element: UISpecV2["elements"][string]): boolean {
  if (element.type === "Checkbox") {
    const checked = element.props.checked;
    return (
      !!checked &&
      typeof checked === "object" &&
      !Array.isArray(checked) &&
      typeof (checked as { $bindState?: unknown }).$bindState === "string"
    );
  }

  if (element.type === "Input" || element.type === "Textarea" || element.type === "Select") {
    const value = element.props.value;
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { $bindState?: unknown }).$bindState === "string"
    );
  }

  return true;
}

function hasValidateFormAction(spec: UISpecV2): boolean {
  return Object.values(spec.elements).some((element) => {
    if (element.type !== "Button" || !element.on) {
      return false;
    }

    const pressBinding = element.on.press;
    const bindings = Array.isArray(pressBinding) ? pressBinding : pressBinding ? [pressBinding] : [];
    return bindings.some((binding) => binding.action === "validateForm");
  });
}

function requiresFormScaffold(spec: UISpecV2, prompt: string): boolean {
  if (detectPromptPack(prompt) !== "form") {
    return false;
  }

  if (!isUsableSpecForPromptPackV2(spec, prompt)) {
    return true;
  }

  const formElements = Object.values(spec.elements).filter((element) =>
    ["Card", "CardHeader", "CardContent", "CardFooter", "Input", "Textarea", "Select", "Checkbox", "Button"].includes(element.type)
  );

  if (formElements.some((element) => element.visible === false)) {
    return true;
  }

  if (!spec.state || typeof spec.state !== "object" || !("form" in spec.state)) {
    return true;
  }

  const controls = formElements.filter((element) =>
    ["Input", "Textarea", "Select", "Checkbox"].includes(element.type)
  );
  if (controls.some((element) => !isFormControlBound(element))) {
    return true;
  }

  if (!hasValidateFormAction(spec)) {
    return true;
  }

  return false;
}

function autoScaffoldFormSpecV2(spec: UISpecV2, prompt: string): { spec: UISpecV2; fixes: string[] } {
  if (detectPromptPack(prompt) !== "form") {
    return { spec, fixes: [] };
  }

  if (!requiresFormScaffold(spec, prompt)) {
    return { spec, fixes: [] };
  }

  const scaffoldedSpec = normalizeTreeToSpecV2(buildFormSnapshotV2(prompt, spec));
  return {
    spec: scaffoldedSpec,
    fixes: ["Applied canonical form scaffold with grouped fields and footer actions."]
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
    let pass1: ExtractComponentsResult;
    try {
      pass1 = await deps.model.extractComponents({
        prompt: request.prompt,
        previousSpec: baseVersion?.specSnapshot ?? null
      });
    } catch (error) {
      const fallbackComponents = getFallbackPromptComponents(request.prompt);
      const message =
        error instanceof Error ? error.message : "Pass 1 component extraction failed unexpectedly.";
      const warning = {
        type: "warning" as const,
        generationId,
        code: "PASS1_EXTRACT_FALLBACK",
        message: `Pass 1 extraction failed (${message}). Using prompt-derived component set: ${fallbackComponents.join(", ")}.`
      };
      warnings.push({ code: warning.code, message: warning.message });
      yield warning;
      pass1 = {
        components: fallbackComponents,
        intentType: baseVersion?.specSnapshot ? "modify" : "new",
        confidence: 0
      };
    }

    if (pass1.components.length === 0) {
      const fallbackComponents = getFallbackPromptComponents(request.prompt);
      const warning = {
        type: "warning" as const,
        generationId,
        code: "PASS1_EMPTY_COMPONENTS",
        message: `Pass 1 returned no components. Using prompt-derived component set: ${fallbackComponents.join(", ")}.`
      };
      warnings.push({ code: warning.code, message: warning.message });
      yield warning;
      pass1 = {
        ...pass1,
        components: fallbackComponents
      };
    }

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

            const formScaffoldFix = autoScaffoldFormSpecV2(candidateSpec, request.prompt);
            if (formScaffoldFix.fixes.length > 0) {
              candidateSpec = formScaffoldFix.spec;
              candidateAcceptedWarnings.push({
                code: "V2_FORM_SCAFFOLD_APPLIED",
                message: `Applied form scaffold before semantic validation: ${formScaffoldFix.fixes.join(" ")}`
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
              usedStructuralAutofix ||
              packFix.fixes.length > 0 ||
              formScaffoldFix.fixes.length > 0 ||
              presentation.changed
                ? null
                : snapshot;
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
