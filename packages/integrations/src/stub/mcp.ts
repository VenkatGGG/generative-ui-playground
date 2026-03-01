import type { MCPAdapter } from "../interfaces";

interface StubRuleTemplate {
  allowedProps: string[];
  variants: string[];
  compositionRules: string[];
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
  button: {
    allowedProps: ["className", "variant", "size"],
    variants: ["default", "secondary", "outline", "destructive", "sm", "lg"],
    compositionRules: ["Always include short visible label text."],
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
    notes:
      "Unsupported component in stub MCP context. Prefer Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, and Text."
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
            notes: rule.notes
          };
        })
      };
    }
  };
}
