import type { StreamDesignInput } from "../interfaces";

export type PromptPackId = "pricing-card" | "dashboard" | "form" | "hero" | "generic";

export interface PromptStyleTokens {
  colors: string[];
  aesthetics: string[];
  spacing: string[];
  hierarchy: string[];
}

interface PackExamples {
  good: Array<Record<string, unknown>>;
  bad: string;
}

interface PromptPackDefinition {
  id: PromptPackId;
  triggers: RegExp[];
  goals: string[];
  requiredRulesV1: string[];
  requiredRulesV2: string[];
  minElementsV1: number;
  minElementsV2: number;
  examplesV1: PackExamples;
  examplesV2: PackExamples;
}

const COLOR_KEYWORDS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "pink",
  "rose",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "black",
  "white"
] as const;

const AESTHETIC_KEYWORDS = [
  "clean",
  "modern",
  "minimal",
  "bold",
  "elegant",
  "playful",
  "premium",
  "glass",
  "brutalist",
  "soft",
  "subtle"
] as const;

const SPACING_KEYWORDS = ["compact", "spacious", "airy", "tight", "dense", "padding", "gap"] as const;
const HIERARCHY_KEYWORDS = ["headline", "title", "subtitle", "cta", "primary", "secondary", "emphasis"] as const;

const PROMPT_PACKS: ReadonlyArray<PromptPackDefinition> = [
  {
    id: "pricing-card",
    triggers: [/\bpricing\b/i, /\bplan\b/i, /\b\/mo\b/i, /\bcta\b/i, /\bsubscribe|trial\b/i],
    goals: [
      "Create a commercial pricing card with clear value proposition.",
      "Ensure immediate readability: title, description, price, features, CTA hierarchy."
    ],
    requiredRulesV1: [
      "Root must be Card.",
      "Include CardHeader with CardTitle and CardDescription.",
      "Include CardContent with price text, feature list text, primary Button, and secondary Button."
    ],
    requiredRulesV2: [
      "Root must be Card.",
      "Include CardHeader with CardTitle and CardDescription.",
      "Include CardContent with at least one Stack or repeated feature block.",
      "Use Button visibility/actions if prompt asks for conditional CTA behavior."
    ],
    minElementsV1: 8,
    minElementsV2: 10,
    examplesV1: {
      good: [
        {
          id: "root",
          type: "Card",
          children: [
            {
              id: "header",
              type: "CardHeader",
              children: [
                { id: "title", type: "CardTitle", children: ["Pro Plan"] },
                { id: "desc", type: "CardDescription", children: ["Great for startups."] }
              ]
            },
            {
              id: "content",
              type: "CardContent",
              children: [
                { id: "price", type: "Text", children: ["$29/mo"] },
                { id: "f1", type: "Text", children: ["• Priority support"] },
                { id: "f2", type: "Text", children: ["• Team collaboration"] },
                { id: "cta1", type: "Button", children: ["Start Free Trial"] },
                { id: "cta2", type: "Button", props: { variant: "outline" }, children: ["View Docs"] }
              ]
            }
          ]
        },
        {
          id: "root",
          type: "Card",
          children: [
            {
              id: "header",
              type: "CardHeader",
              children: [
                { id: "title", type: "CardTitle", children: ["Starter Plan"] },
                { id: "desc", type: "CardDescription", children: ["For individuals."] }
              ]
            },
            {
              id: "content",
              type: "CardContent",
              children: [
                { id: "price", type: "Text", children: ["$9/mo"] },
                { id: "badge", type: "Badge", children: ["Popular"] },
                { id: "cta", type: "Button", children: ["Choose Plan"] }
              ]
            }
          ]
        }
      ],
      bad: "Anti-pattern: single empty Card node with no header/content/body actions."
    },
    examplesV2: {
      good: [
        {
          state: { features: [{ id: "f1", label: "Priority support" }] },
          tree: {
            id: "root",
            type: "Card",
            children: [
              {
                id: "header",
                type: "CardHeader",
                children: [
                  { id: "title", type: "CardTitle", children: ["Pro Plan"] },
                  { id: "desc", type: "CardDescription", children: ["For fast-growing teams."] }
                ]
              },
              {
                id: "content",
                type: "CardContent",
                children: [
                  { id: "price", type: "Text", children: ["$29/mo"] },
                  {
                    id: "features",
                    type: "Stack",
                    repeat: { statePath: "/features", key: "id" },
                    children: [{ id: "feature", type: "Text", props: { text: { $item: "label" } }, children: [] }]
                  },
                  { id: "cta", type: "Button", children: ["Start Free Trial"] }
                ]
              }
            ]
          }
        },
        {
          state: { showSecondary: true },
          tree: {
            id: "root",
            type: "Card",
            children: [
              {
                id: "header",
                type: "CardHeader",
                children: [{ id: "title", type: "CardTitle", children: ["Business Plan"] }]
              },
              {
                id: "content",
                type: "CardContent",
                children: [
                  { id: "cta1", type: "Button", children: ["Book Demo"] },
                  {
                    id: "cta2",
                    type: "Button",
                    visible: { $state: "/showSecondary", eq: true },
                    props: { variant: "outline" },
                    children: ["Learn More"]
                  }
                ]
              }
            ]
          }
        }
      ],
      bad: "Anti-pattern: one-node tree that only declares Card and no meaningful children."
    }
  },
  {
    id: "dashboard",
    triggers: [/\bdashboard\b/i, /\bmetrics?\b/i, /\bchart\b/i, /\bstats?\b/i, /\banalytics\b/i],
    goals: [
      "Create a multi-section information-dense layout.",
      "Use sectioning and hierarchy for scanning (headline, metric blocks, controls)."
    ],
    requiredRulesV1: [
      "Use at least two Card sections.",
      "Include summary text and at least one action Button."
    ],
    requiredRulesV2: [
      "Use Stack layout blocks for multiple sections.",
      "Use state-driven visibility or repeat for list-like metric rows."
    ],
    minElementsV1: 10,
    minElementsV2: 12,
    examplesV1: {
      good: [
        {
          id: "root",
          type: "Card",
          children: [
            {
              id: "content",
              type: "CardContent",
              children: [
                { id: "h", type: "Text", children: ["Revenue Dashboard"] },
                { id: "c1", type: "Card", children: [{ id: "c1t", type: "Text", children: ["MRR"] }] },
                { id: "c2", type: "Card", children: [{ id: "c2t", type: "Text", children: ["Churn"] }] }
              ]
            }
          ]
        },
        {
          id: "root",
          type: "Card",
          children: [
            { id: "header", type: "CardHeader", children: [{ id: "title", type: "CardTitle", children: ["Ops"] }] },
            {
              id: "content",
              type: "CardContent",
              children: [{ id: "refresh", type: "Button", children: ["Refresh"] }]
            }
          ]
        }
      ],
      bad: "Anti-pattern: returning only one Text node for a multi-section dashboard prompt."
    },
    examplesV2: {
      good: [
        {
          state: { metrics: [{ id: "m1", label: "MRR", value: "$42k" }] },
          tree: {
            id: "root",
            type: "Card",
            children: [
              {
                id: "content",
                type: "CardContent",
                children: [
                  {
                    id: "rows",
                    type: "Stack",
                    repeat: { statePath: "/metrics", key: "id" },
                    children: [
                      { id: "metricLabel", type: "Text", props: { text: { $item: "label" } }, children: [] },
                      { id: "metricValue", type: "Text", props: { text: { $item: "value" } }, children: [] }
                    ]
                  }
                ]
              }
            ]
          }
        },
        {
          state: { showActions: true },
          tree: {
            id: "root",
            type: "Card",
            children: [
              { id: "title", type: "CardTitle", children: ["Operations"] },
              {
                id: "refresh",
                type: "Button",
                visible: { $state: "/showActions", eq: true },
                children: ["Refresh data"]
              }
            ]
          }
        }
      ],
      bad: "Anti-pattern: Card with empty children and no metric hierarchy."
    }
  },
  {
    id: "form",
    triggers: [/\bform\b/i, /\blogin\b/i, /\bsign[- ]?up\b/i, /\binput\b/i, /\bsubmit\b/i],
    goals: [
      "Create a clear form flow with inputs and explicit submit action.",
      "Prefer concise labels/placeholders and validation-friendly structure."
    ],
    requiredRulesV1: [
      "Include Input or Textarea plus submit Button.",
      "Group form controls inside CardContent."
    ],
    requiredRulesV2: [
      "Use state object for form values.",
      "Use $bindState for Input/Textarea/Select/Checkbox controls.",
      "Use on.submit/on.press action with validateForm or setState."
    ],
    minElementsV1: 6,
    minElementsV2: 9,
    examplesV1: {
      good: [
        {
          id: "root",
          type: "Card",
          children: [
            {
              id: "content",
              type: "CardContent",
              children: [
                { id: "email", type: "Input", props: { placeholder: "Email" } },
                { id: "pw", type: "Input", props: { placeholder: "Password", type: "password" } },
                { id: "submit", type: "Button", children: ["Sign in"] }
              ]
            }
          ]
        },
        {
          id: "root",
          type: "Card",
          children: [
            { id: "title", type: "CardTitle", children: ["Contact"] },
            { id: "message", type: "Textarea", props: { placeholder: "Message" } },
            { id: "send", type: "Button", children: ["Send"] }
          ]
        }
      ],
      bad: "Anti-pattern: single form control without container, supporting copy, or submit action."
    },
    examplesV2: {
      good: [
        {
          state: { form: { email: "", accepted: false } },
          tree: {
            id: "root",
            type: "Card",
            children: [
              {
                id: "content",
                type: "CardContent",
                children: [
                  { id: "email", type: "Input", props: { value: { $bindState: "/form/email" } }, children: [] },
                  {
                    id: "accepted",
                    type: "Checkbox",
                    props: { checked: { $bindState: "/form/accepted" }, label: "I agree" },
                    children: []
                  },
                  {
                    id: "submit",
                    type: "Button",
                    on: { press: { action: "validateForm", params: { path: "/form", required: ["email"] } } },
                    children: ["Submit"]
                  }
                ]
              }
            ]
          }
        },
        {
          state: { form: { role: "dev" } },
          tree: {
            id: "root",
            type: "Card",
            children: [
              {
                id: "role",
                type: "Select",
                props: {
                  options: [
                    { label: "Developer", value: "dev" },
                    { label: "Designer", value: "design" }
                  ],
                  value: { $bindState: "/form/role" }
                },
                children: []
              }
            ]
          }
        }
      ],
      bad: "Anti-pattern: lone submit button with no inputs or form state bindings."
    }
  },
  {
    id: "hero",
    triggers: [/\bhero\b/i, /\blanding\b/i, /\bheadline\b/i, /\bmarketing\b/i],
    goals: [
      "Create a high-clarity top-of-page section with headline, support copy, and CTA.",
      "Ensure visual hierarchy and spacing between title, text, and actions."
    ],
    requiredRulesV1: [
      "Include prominent title text and supporting text.",
      "Include one primary action Button."
    ],
    requiredRulesV2: [
      "Include title/description plus action group in Stack.",
      "Use visibility or state only when prompt requests dynamic behavior."
    ],
    minElementsV1: 6,
    minElementsV2: 8,
    examplesV1: {
      good: [
        {
          id: "root",
          type: "Card",
          children: [
            { id: "title", type: "CardTitle", children: ["Ship faster with generative UI"] },
            { id: "desc", type: "Text", children: ["Design and iterate in seconds."] },
            { id: "cta", type: "Button", children: ["Get started"] }
          ]
        },
        {
          id: "root",
          type: "Card",
          children: [
            { id: "h", type: "Text", children: ["Build beautiful products"] },
            { id: "cta", type: "Button", children: ["Try now"] }
          ]
        }
      ],
      bad: "Anti-pattern: hero layout reduced to a single button with no headline/supporting text."
    },
    examplesV2: {
      good: [
        {
          tree: {
            id: "root",
            type: "Card",
            children: [
              {
                id: "heroStack",
                type: "Stack",
                props: { direction: "vertical", gap: "gap-4" },
                children: [
                  { id: "title", type: "CardTitle", children: ["Build faster"] },
                  { id: "desc", type: "CardDescription", children: ["Move from idea to UI instantly."] },
                  { id: "cta", type: "Button", children: ["Start now"] }
                ]
              }
            ]
          }
        },
        {
          state: { showSecondary: true },
          tree: {
            id: "root",
            type: "Card",
            children: [
              { id: "title", type: "CardTitle", children: ["Your product, launched"] },
              {
                id: "secondary",
                type: "Button",
                visible: { $state: "/showSecondary", eq: true },
                props: { variant: "outline" },
                children: ["Read docs"]
              }
            ]
          }
        }
      ],
      bad: "Anti-pattern: one short text node without hero hierarchy or CTA grouping."
    }
  }
];

function findPackById(id: PromptPackId): PromptPackDefinition {
  if (id === "generic") {
    return {
      id: "generic",
      triggers: [],
      goals: ["Create complete UI output with clear hierarchy and actionable controls."],
      requiredRulesV1: [
        "Do not return empty roots.",
        "Use at least one heading text and one action when user requests actionable UI."
      ],
      requiredRulesV2: [
        "Do not return empty roots.",
        "Use semantic fields only when needed and valid.",
        "Prefer state-driven bindings for form-like interactions."
      ],
      minElementsV1: 6,
      minElementsV2: 8,
      examplesV1: {
        good: [
          {
            id: "root",
            type: "Card",
            children: [
              { id: "title", type: "CardTitle", children: ["Generated UI"] },
              { id: "content", type: "CardContent", children: [{ id: "cta", type: "Button", children: ["Continue"] }] }
            ]
          },
          {
            id: "root",
            type: "Card",
            children: [{ id: "txt", type: "Text", children: ["Meaningful content"] }]
          }
        ],
        bad: "Anti-pattern: bare Card root without meaningful content hierarchy."
      },
      examplesV2: {
        good: [
          {
            tree: {
              id: "root",
              type: "Card",
              children: [{ id: "title", type: "CardTitle", children: ["Generated UI"] }]
            }
          },
          {
            state: { items: [{ id: "1", label: "Item" }] },
            tree: {
              id: "root",
              type: "Card",
              children: [
                {
                  id: "rows",
                  type: "Stack",
                  repeat: { statePath: "/items", key: "id" },
                  children: [{ id: "row", type: "Text", props: { text: { $item: "label" } }, children: [] }]
                }
              ]
            }
          }
        ],
        bad: "Anti-pattern: semantic snapshot with empty Card and no actionable content."
      }
    };
  }

  return PROMPT_PACKS.find((pack) => pack.id === id) ?? findPackById("generic");
}

export function detectPromptPack(prompt: string): PromptPackId {
  for (const pack of PROMPT_PACKS) {
    if (pack.triggers.some((trigger) => trigger.test(prompt))) {
      return pack.id;
    }
  }
  return "generic";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function extractKeywordMatches(promptLower: string, keywords: readonly string[]): string[] {
  return unique(
    keywords.filter((keyword) => {
      if (keyword.length <= 2) {
        return promptLower.includes(keyword);
      }
      return new RegExp(`\\b${keyword}\\b`, "i").test(promptLower);
    })
  );
}

function extractHexColors(prompt: string): string[] {
  return unique(Array.from(prompt.matchAll(/#[0-9a-fA-F]{3,8}\b/g)).map((match) => match[0] ?? ""));
}

export function extractStyleTokens(prompt: string): PromptStyleTokens {
  const lower = prompt.toLowerCase();
  const keywordColors = extractKeywordMatches(lower, COLOR_KEYWORDS);
  const hexColors = extractHexColors(prompt);

  return {
    colors: unique([...keywordColors, ...hexColors]),
    aesthetics: extractKeywordMatches(lower, AESTHETIC_KEYWORDS),
    spacing: extractKeywordMatches(lower, SPACING_KEYWORDS),
    hierarchy: extractKeywordMatches(lower, HIERARCHY_KEYWORDS)
  };
}

export interface PromptSkillSectionInput {
  prompt: string;
  isV2: boolean;
}

export function buildPromptSkillSection(input: PromptSkillSectionInput): string {
  const packId = detectPromptPack(input.prompt);
  const pack = findPackById(packId);
  const styles = extractStyleTokens(input.prompt);
  const examples = input.isV2 ? pack.examplesV2 : pack.examplesV1;
  const rules = input.isV2 ? pack.requiredRulesV2 : pack.requiredRulesV1;
  const minElements = input.isV2 ? pack.minElementsV2 : pack.minElementsV1;

  const lines: string[] = [];
  lines.push(`PROMPT PACK: ${pack.id}`);
  lines.push(`GOALS: ${pack.goals.join(" ")}`);
  lines.push("REQUIRED STRUCTURE:");
  for (const rule of rules) {
    lines.push(`- ${rule}`);
  }
  lines.push(`ANTI-SKELETON: output must have at least ${minElements} elements unless user explicitly asks for a tiny snippet.`);
  lines.push("STYLE TOKENS:");
  lines.push(`- colors: ${styles.colors.length > 0 ? styles.colors.join(", ") : "not specified"}`);
  lines.push(`- aesthetics: ${styles.aesthetics.length > 0 ? styles.aesthetics.join(", ") : "not specified"}`);
  lines.push(`- spacing: ${styles.spacing.length > 0 ? styles.spacing.join(", ") : "not specified"}`);
  lines.push(`- hierarchy: ${styles.hierarchy.length > 0 ? styles.hierarchy.join(", ") : "not specified"}`);
  lines.push("FEW-SHOT EXAMPLES:");
  lines.push(`GOOD_EXAMPLE_1: ${JSON.stringify(examples.good[0])}`);
  lines.push(`GOOD_EXAMPLE_2: ${JSON.stringify(examples.good[1])}`);
  lines.push(`BAD_EXAMPLE_REJECT: ${examples.bad}`);

  return lines.join("\n");
}

export function buildPass2ContractBlock(isV2: boolean): string {
  if (isV2) {
    return [
      "PASS2 CONTRACT (STRICT):",
      "- Output exactly one JSON object matching { state?: object, tree: UIComponentNodeV2 }.",
      "- Do not output multiple root JSON objects in one response.",
      "- Use only allowed component types from the catalog section.",
      "- Enforce valid semantic fields: visible, repeat, on, watch, dynamic expressions.",
      "- Never output empty/sparse skeletons; produce complete, renderable layouts."
    ].join("\n");
  }

  return [
    "PASS2 CONTRACT (STRICT):",
    "- Output newline-delimited JSON objects only.",
    "- Each line must be one complete UIComponentNode object.",
    "- Use only allowed component types from the catalog section.",
    "- Follow required composition rules for Card/CardHeader/CardContent and action placement.",
    "- Never output empty/sparse skeletons; produce complete, renderable layouts."
  ].join("\n");
}

export interface RetryFeedbackIssue {
  code: string;
  message: string;
}

export function buildRetryPromptWithValidationFeedback(
  originalPrompt: string,
  issues: RetryFeedbackIssue[],
  attempt: number
): string {
  if (issues.length === 0) {
    return `${originalPrompt}\n\nRetry attempt ${attempt}. Produce a richer valid output.`;
  }

  const lines = issues.map((issue) => `- [${issue.code}] ${issue.message}`);
  return [
    originalPrompt,
    "",
    `Retry attempt ${attempt}. You MUST fix all validation findings below:`,
    ...lines,
    "Do not repeat the prior invalid structure. Return exactly one complete valid JSON snapshot."
  ].join("\n");
}

export function estimatePromptPackMinElements(input: StreamDesignInput, isV2: boolean): number {
  const packId = detectPromptPack(input.prompt);
  const pack = findPackById(packId);
  return isV2 ? pack.minElementsV2 : pack.minElementsV1;
}
