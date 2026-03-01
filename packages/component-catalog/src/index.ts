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

export interface ComponentCatalogEntry {
  type: AllowedComponentType;
  allowedProps: readonly string[];
  variants?: readonly string[];
  description: string;
  compositionRules?: readonly string[];
}

const COMPONENT_SET = new Set<string>(ALLOWED_COMPONENT_TYPES);
const COMPONENT_BY_LOWER = new Map<string, AllowedComponentType>(
  ALLOWED_COMPONENT_TYPES.map((componentType) => [componentType.toLowerCase(), componentType])
);

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
    },
    {
      id: "divider",
      type: "Separator",
      props: {
        orientation: "horizontal"
      }
    },
    {
      id: "footer",
      type: "CardFooter",
      props: {
        className: "justify-end"
      },
      children: [
        {
          id: "contact-input",
          type: "Input",
          props: {
            placeholder: "Work email"
          }
        }
      ]
    }
  ]
} as const;

export function getAllowedComponentTypeSet(): Set<string> {
  return new Set(ALLOWED_COMPONENT_TYPES);
}

export function isAllowedComponentType(type: string): boolean {
  return COMPONENT_SET.has(type);
}

export function canonicalizeCatalogComponentType(type: string): string {
  const trimmed = type.trim();
  const supported = COMPONENT_BY_LOWER.get(trimmed.toLowerCase());
  if (supported) {
    return supported;
  }

  return TYPE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function buildPass2CatalogSection(): string {
  const lines: string[] = [];
  lines.push(`AVAILABLE COMPONENTS (${COMPONENT_CATALOG.length})`);

  for (const component of COMPONENT_CATALOG) {
    const props = component.allowedProps.join(", ");
    const variants = component.variants?.length ? `; variants: ${component.variants.join(", ")}` : "";
    const composition = component.compositionRules?.length
      ? `; composition: ${component.compositionRules.join(" ")}`
      : "";

    lines.push(`- ${component.type}: props [${props}]${variants}. ${component.description}${composition}`);
  }

  lines.push("Only use component types from this list.");
  return lines.join("\n");
}
