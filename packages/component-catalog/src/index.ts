export type RuntimeEventName = "press" | "change" | "submit";

export interface ComponentCatalogEntryBase<TComponentType extends string> {
  type: TComponentType;
  allowedProps: readonly string[];
  variants?: readonly string[];
  description: string;
  compositionRules?: readonly string[];
  supportedEvents?: readonly RuntimeEventName[];
  supportsRepeat?: boolean;
  supportsVisibility?: boolean;
  supportsBindings?: boolean;
}

export const ALLOWED_COMPONENT_TYPES = [
  "Card",
  "CardHeader",
  "CardTitle",
  "CardDescription",
  "CardContent",
  "CardFooter",
  "Button",
  "Badge",
  "Text",
  "Input",
  "Textarea",
  "Separator"
] as const;

export type AllowedComponentType = (typeof ALLOWED_COMPONENT_TYPES)[number];
export type ComponentCatalogEntry = ComponentCatalogEntryBase<AllowedComponentType>;

export const COMPONENT_CATALOG: ReadonlyArray<ComponentCatalogEntry> = [
  {
    type: "Card",
    allowedProps: ["className"],
    description: "Primary container card with border/shadow styling.",
    compositionRules: [
      "Must include CardHeader with CardTitle (CardDescription optional).",
      "Must include CardContent for body text and actions."
    ]
  },
  {
    type: "CardHeader",
    allowedProps: ["className"],
    description: "Top section in a Card containing heading content.",
    compositionRules: ["Use inside Card and include CardTitle."]
  },
  {
    type: "CardTitle",
    allowedProps: ["className"],
    description: "Short heading text for Card title."
  },
  {
    type: "CardDescription",
    allowedProps: ["className"],
    description: "Secondary supporting text under CardTitle."
  },
  {
    type: "CardContent",
    allowedProps: ["className"],
    description: "Card body section for details, lists, badges, and actions."
  },
  {
    type: "CardFooter",
    allowedProps: ["className"],
    description: "Bottom section of Card for compact actions."
  },
  {
    type: "Button",
    allowedProps: ["className", "variant", "size"],
    variants: ["default", "secondary", "outline", "destructive", "sm", "lg"],
    description: "Action trigger with visible text label."
  },
  {
    type: "Badge",
    allowedProps: ["className", "variant"],
    variants: ["default", "secondary", "outline", "destructive"],
    description: "Compact status indicator text."
  },
  {
    type: "Text",
    allowedProps: ["className"],
    description: "General readable body copy."
  },
  {
    type: "Input",
    allowedProps: ["className", "placeholder", "type", "value"],
    description: "Single-line form input."
  },
  {
    type: "Textarea",
    allowedProps: ["className", "placeholder", "value", "rows"],
    description: "Multi-line text input."
  },
  {
    type: "Separator",
    allowedProps: ["className", "orientation"],
    variants: ["horizontal", "vertical"],
    description: "Visual divider between sections."
  }
] as const;

export const ALLOWED_COMPONENT_TYPES_V2 = [
  "Card",
  "CardHeader",
  "CardTitle",
  "CardDescription",
  "CardContent",
  "CardFooter",
  "Text",
  "Button",
  "Badge",
  "Input",
  "Textarea",
  "Separator",
  "Checkbox",
  "Select",
  "Stack"
] as const;

export type AllowedComponentTypeV2 = (typeof ALLOWED_COMPONENT_TYPES_V2)[number];
export type ComponentCatalogEntryV2 = ComponentCatalogEntryBase<AllowedComponentTypeV2>;

export const COMPONENT_CATALOG_V2: ReadonlyArray<ComponentCatalogEntryV2> = [
  {
    type: "Card",
    allowedProps: ["className"],
    description: "Primary container card.",
    compositionRules: [
      "Must include CardHeader with CardTitle (CardDescription optional).",
      "Must include CardContent for actionable body content."
    ],
    supportsVisibility: true
  },
  {
    type: "CardHeader",
    allowedProps: ["className"],
    description: "Card heading container.",
    compositionRules: ["Use inside Card and include CardTitle."],
    supportsVisibility: true
  },
  {
    type: "CardTitle",
    allowedProps: ["className"],
    description: "Primary heading text in Card.",
    supportsVisibility: true,
    supportsBindings: true
  },
  {
    type: "CardDescription",
    allowedProps: ["className"],
    description: "Secondary heading text in Card.",
    supportsVisibility: true,
    supportsBindings: true
  },
  {
    type: "CardContent",
    allowedProps: ["className"],
    description: "Main body container inside Card.",
    supportsRepeat: true,
    supportsVisibility: true
  },
  {
    type: "CardFooter",
    allowedProps: ["className"],
    description: "Bottom action row inside Card.",
    supportsVisibility: true
  },
  {
    type: "Text",
    allowedProps: ["className", "text"],
    description: "General body text.",
    supportsRepeat: true,
    supportsVisibility: true,
    supportsBindings: true
  },
  {
    type: "Button",
    allowedProps: ["className", "variant", "size", "type"],
    variants: ["default", "secondary", "outline", "destructive", "sm", "lg"],
    description: "Clickable action trigger.",
    supportedEvents: ["press"],
    supportsVisibility: true,
    supportsBindings: true
  },
  {
    type: "Badge",
    allowedProps: ["className", "variant"],
    variants: ["default", "secondary", "outline", "destructive"],
    description: "Compact label/status indicator.",
    supportsVisibility: true,
    supportsBindings: true
  },
  {
    type: "Input",
    allowedProps: ["className", "placeholder", "type", "value"],
    description: "Single-line input field.",
    supportedEvents: ["change"],
    supportsVisibility: true,
    supportsBindings: true
  },
  {
    type: "Textarea",
    allowedProps: ["className", "placeholder", "value", "rows"],
    description: "Multi-line input field.",
    supportedEvents: ["change"],
    supportsVisibility: true,
    supportsBindings: true
  },
  {
    type: "Separator",
    allowedProps: ["className", "orientation"],
    variants: ["horizontal", "vertical"],
    description: "Visual separator line.",
    supportsVisibility: true
  },
  {
    type: "Checkbox",
    allowedProps: ["className", "checked", "label"],
    description: "Binary selection control.",
    supportedEvents: ["change"],
    supportsVisibility: true,
    supportsBindings: true
  },
  {
    type: "Select",
    allowedProps: ["className", "value", "options", "placeholder"],
    description: "Single-select control with predefined options.",
    supportedEvents: ["change"],
    supportsVisibility: true,
    supportsBindings: true
  },
  {
    type: "Stack",
    allowedProps: ["className", "direction", "gap"],
    variants: ["vertical", "horizontal"],
    description: "Layout helper that stacks children.",
    supportsRepeat: true,
    supportsVisibility: true
  }
] as const;

const COMPONENT_SET = new Set<string>(ALLOWED_COMPONENT_TYPES);
const COMPONENT_BY_LOWER = new Map<string, AllowedComponentType>(
  ALLOWED_COMPONENT_TYPES.map((componentType) => [componentType.toLowerCase(), componentType])
);

const COMPONENT_SET_V2 = new Set<string>(ALLOWED_COMPONENT_TYPES_V2);
const COMPONENT_BY_LOWER_V2 = new Map<string, AllowedComponentTypeV2>(
  ALLOWED_COMPONENT_TYPES_V2.map((componentType) => [componentType.toLowerCase(), componentType])
);

const TYPE_ALIASES: Record<string, AllowedComponentType> = {
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
  typography: "Text",
  label: "Text",
  pricedisplay: "Text",
  listitem: "Text",
  listitemtext: "Text",
  p: "Text",
  span: "Text",
  body: "Text",
  caption: "Text",
  icon: "Text",
  image: "Text",
  input: "Input",
  field: "Input",
  textarea: "Textarea",
  "text-area": "Textarea",
  form: "CardContent",
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
  footer: "CardFooter",
  divider: "Separator",
  hr: "Separator",
  ctabutton: "Button",
  link: "Button",
  anchor: "Button",
  a: "Button"
};

const TYPE_ALIASES_V2: Record<string, AllowedComponentTypeV2> = {
  pricingcard: "Card",
  card: "Card",
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
  typography: "Text",
  label: "Text",
  pricedisplay: "Text",
  listitem: "Text",
  listitemtext: "Text",
  p: "Text",
  span: "Text",
  body: "Text",
  caption: "Text",
  icon: "Text",
  image: "Text",
  input: "Input",
  field: "Input",
  textarea: "Textarea",
  "text-area": "Textarea",
  checkbox: "Checkbox",
  check: "Checkbox",
  select: "Select",
  dropdown: "Select",
  form: "Stack",
  list: "Stack",
  stack: "Stack",
  box: "Stack",
  container: "Stack",
  section: "Stack",
  wrapper: "Stack",
  div: "Stack",
  content: "Stack",
  main: "Stack",
  flex: "Stack",
  grid: "Stack",
  row: "Stack",
  column: "Stack",
  footer: "CardFooter",
  divider: "Separator",
  hr: "Separator",
  ctabutton: "Button",
  link: "Button",
  anchor: "Button",
  a: "Button"
};

export const PASS2_EXAMPLE_TREE = {
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
          props: {
            variant: "secondary"
          },
          children: ["Popular"]
        },
        {
          id: "cta-primary",
          type: "Button",
          props: {
            variant: "default",
            size: "default"
          },
          children: ["Start Free Trial"]
        },
        {
          id: "cta-secondary",
          type: "Button",
          props: {
            variant: "outline",
            size: "default"
          },
          children: ["View Docs"]
        }
      ]
    }
  ]
} as const;

export const PASS2_EXAMPLE_TREE_V2 = {
  state: {
    features: [
      { id: "f1", label: "Unlimited projects" },
      { id: "f2", label: "Priority support" },
      { id: "f3", label: "Team collaboration" }
    ],
    form: {
      email: "",
      accepted: false
    }
  },
  tree: {
    id: "root",
    type: "Card",
    props: {
      className: "w-full max-w-lg rounded-xl border shadow-sm"
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
            children: ["Perfect for startups and teams shipping quickly."]
          }
        ]
      },
      {
        id: "content",
        type: "CardContent",
        props: { className: "space-y-3" },
        children: [
          {
            id: "feature-list",
            type: "Stack",
            repeat: { statePath: "/features", key: "id" },
            children: [
              {
                id: "feature-text",
                type: "Text",
                props: { text: { $item: "label" } },
                children: []
              }
            ]
          },
          {
            id: "email",
            type: "Input",
            props: {
              placeholder: "Work email",
              value: { $bindState: "/form/email" }
            },
            children: []
          },
          {
            id: "accept",
            type: "Checkbox",
            props: {
              label: "I agree to terms",
              checked: { $bindState: "/form/accepted" }
            },
            children: []
          },
          {
            id: "cta",
            type: "Button",
            props: {
              variant: "default"
            },
            visible: { $state: "/form/accepted", eq: true },
            on: {
              press: {
                action: "validateForm",
                params: {
                  path: "/form",
                  required: ["email"]
                }
              }
            },
            children: ["Start Free Trial"]
          }
        ]
      }
    ]
  }
} as const;

export function getAllowedComponentTypeSet(): Set<string> {
  return new Set(ALLOWED_COMPONENT_TYPES);
}

export function getAllowedComponentTypeSetV2(): Set<string> {
  return new Set(ALLOWED_COMPONENT_TYPES_V2);
}

export function isAllowedComponentType(type: string): boolean {
  return COMPONENT_SET.has(type);
}

export function isAllowedComponentTypeV2(type: string): boolean {
  return COMPONENT_SET_V2.has(type);
}

export function canonicalizeCatalogComponentType(type: string): string {
  const trimmed = type.trim();
  const supported = COMPONENT_BY_LOWER.get(trimmed.toLowerCase());
  if (supported) {
    return supported;
  }

  return TYPE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function canonicalizeCatalogComponentTypeV2(type: string): string {
  const trimmed = type.trim();
  const supported = COMPONENT_BY_LOWER_V2.get(trimmed.toLowerCase());
  if (supported) {
    return supported;
  }

  return TYPE_ALIASES_V2[trimmed.toLowerCase()] ?? trimmed;
}

function buildCatalogSection(entries: ReadonlyArray<ComponentCatalogEntryBase<string>>): string {
  const lines: string[] = [];
  lines.push(`AVAILABLE COMPONENTS (${entries.length})`);

  for (const component of entries) {
    const props = component.allowedProps.join(", ");
    const variants = component.variants?.length ? `; variants: ${component.variants.join(", ")}` : "";
    const composition = component.compositionRules?.length
      ? `; composition: ${component.compositionRules.join(" ")}`
      : "";
    const events = component.supportedEvents?.length
      ? `; events: ${component.supportedEvents.join(", ")}`
      : "";
    const semantics = [
      component.supportsRepeat ? "repeat" : null,
      component.supportsVisibility ? "visible" : null,
      component.supportsBindings ? "bindings" : null
    ]
      .filter((value): value is string => Boolean(value))
      .join(", ");
    const semanticText = semantics.length > 0 ? `; semantics: ${semantics}` : "";

    lines.push(
      `- ${component.type}: props [${props}]${variants}${events}${semanticText}. ${component.description}${composition}`
    );
  }

  lines.push("Only use component types from this list.");
  return lines.join("\n");
}

export function buildPass2CatalogSection(): string {
  return buildCatalogSection(COMPONENT_CATALOG);
}

export function buildPass2CatalogSectionV2(): string {
  return buildCatalogSection(COMPONENT_CATALOG_V2);
}
