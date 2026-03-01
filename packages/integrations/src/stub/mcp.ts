import type { MCPAdapter } from "../interfaces";

interface StubRuleTemplate {
  allowedProps: string[];
  variants: string[];
  compositionRules: string[];
  supportedEvents?: string[];
  bindingHints?: string[];
  notes: string;
}

const STUB_COMPONENT_RULES: Record<string, StubRuleTemplate> = {
  card: {
    allowedProps: ["className"],
    variants: [],
    compositionRules: [
      "Include CardHeader with CardTitle (CardDescription optional).",
      "Include CardContent with actionable content."
    ],
    notes:
      "Card composition: include CardHeader with CardTitle (optional CardDescription) and CardContent. Always include meaningful visible text."
  },
  cardheader: {
    allowedProps: ["className"],
    variants: [],
    compositionRules: ["Use inside Card and include CardTitle."],
    notes: "CardHeader is the top section of Card. It should contain CardTitle and optionally CardDescription."
  },
  cardtitle: {
    allowedProps: ["className"],
    variants: [],
    compositionRules: ["Provide concise visible heading text."],
    notes: "CardTitle must contain short, meaningful title text as string children."
  },
  carddescription: {
    allowedProps: ["className"],
    variants: [],
    compositionRules: ["Optional supporting text under CardTitle."],
    notes: "CardDescription is optional supporting text beneath CardTitle."
  },
  cardcontent: {
    allowedProps: ["className"],
    variants: [],
    compositionRules: ["Place Text, Badge, and Button nodes here for body/actions."],
    notes: "CardContent is required body area. Place Text, Badge, and Button actions here."
  },
  cardfooter: {
    allowedProps: ["className"],
    variants: [],
    compositionRules: ["Use CardFooter for bottom action row and compact controls."],
    notes: "CardFooter is an optional bottom row for secondary actions or small inputs."
  },
  button: {
    allowedProps: ["className", "variant", "size"],
    variants: ["default", "secondary", "outline", "destructive", "sm", "lg"],
    compositionRules: ["Always include short visible label text."],
    supportedEvents: ["press"],
    bindingHints: ["Use on.press actions for setState/pushState/removeState/validateForm."],
    notes: "Button must include clear visible label text and should be used for primary/secondary actions."
  },
  badge: {
    allowedProps: ["className", "variant"],
    variants: ["default", "secondary", "outline", "destructive"],
    compositionRules: ["Use for short labels only (1-3 words)."],
    notes: "Badge is for short status labels (1-3 words), not long paragraphs."
  },
  text: {
    allowedProps: ["className"],
    variants: [],
    compositionRules: ["Use string children or text prop for visible copy."],
    notes: "Text should carry visible body copy as string children."
  },
  input: {
    allowedProps: ["className", "placeholder", "type", "value"],
    variants: [],
    compositionRules: ["Use short placeholders and avoid long paragraph content."],
    supportedEvents: ["change"],
    bindingHints: ["Prefer value binding with {\"$bindState\":\"/path\"} for editable fields."],
    notes: "Input is a single-line field for compact text entry."
  },
  textarea: {
    allowedProps: ["className", "placeholder", "value", "rows"],
    variants: [],
    compositionRules: ["Use for multi-line notes or feedback text."],
    supportedEvents: ["change"],
    bindingHints: ["Prefer value binding with {\"$bindState\":\"/path\"} for editable fields."],
    notes: "Textarea is a multi-line field for longer content."
  },
  separator: {
    allowedProps: ["className", "orientation"],
    variants: ["horizontal", "vertical"],
    compositionRules: ["Use between major card sections to improve visual hierarchy."],
    notes: "Separator is a non-interactive divider line."
  },
  checkbox: {
    allowedProps: ["className", "checked", "label"],
    variants: [],
    compositionRules: ["Use for binary toggles and short labels."],
    supportedEvents: ["change"],
    bindingHints: ["Prefer checked binding with {\"$bindState\":\"/path\"}."],
    notes: "Checkbox is a boolean control for toggles and consent."
  },
  select: {
    allowedProps: ["className", "value", "options", "placeholder"],
    variants: [],
    compositionRules: ["Provide options as string[] or {label,value}[] in props.options."],
    supportedEvents: ["change"],
    bindingHints: ["Prefer value binding with {\"$bindState\":\"/path\"}."],
    notes: "Select is a single-choice control with predefined options."
  },
  stack: {
    allowedProps: ["className", "direction", "gap"],
    variants: ["vertical", "horizontal"],
    compositionRules: ["Use as layout wrapper for repeated groups or vertical spacing."],
    bindingHints: ["Use repeat with statePath to iterate list-like data."],
    notes: "Stack is a layout helper for arranging children in one axis."
  }
};

function resolveStubRule(componentName: string): StubRuleTemplate {
  const rule = STUB_COMPONENT_RULES[componentName.toLowerCase()];
  if (rule) {
    return rule;
  }

  return {
    allowedProps: ["className"],
    variants: [],
    compositionRules: ["Prefer supported shadcn-like components from current catalog."],
    supportedEvents: [],
    bindingHints: [],
    notes:
      "Unsupported component in stub MCP context. Prefer Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, Badge, Text, Input, Textarea, Separator, Checkbox, Select, and Stack."
  };
}

export function createStubMcpAdapter(): MCPAdapter {
  return {
    async fetchContext(componentNames) {
      return {
        contextVersion: "stub-context-v2",
        componentRules: componentNames.map((name) => {
          const rule = resolveStubRule(name);
          return {
            name,
            allowedProps: rule.allowedProps,
            variants: rule.variants,
            compositionRules: rule.compositionRules,
            supportedEvents: rule.supportedEvents ?? [],
            bindingHints: rule.bindingHints ?? [],
            notes: rule.notes
          };
        })
      };
    }
  };
}
