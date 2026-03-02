import {
  ALLOWED_COMPONENT_TYPES_V2,
  COMPONENT_CATALOG_V2,
  PASS2_EXAMPLE_TREE_V2
} from "./index";

function buildCatalogPromptLines(): string[] {
  const lines: string[] = [];
  lines.push(`AVAILABLE COMPONENTS (${COMPONENT_CATALOG_V2.length})`);

  for (const component of COMPONENT_CATALOG_V2) {
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
  return lines;
}

export function compileCatalogPromptBlockV2(): string {
  return buildCatalogPromptLines().join("\n");
}

export function compileSemanticContractBlockV2(): string {
  return [
    "SEMANTIC CONTRACT:",
    "- Output exactly one JSON object matching { state?: object, tree: UIComponentNodeV2 }.",
    "- Use only component types from AVAILABLE COMPONENTS.",
    "- Use visible for conditional rendering (boolean, state/item/index comparators, $and, $or, implicit AND arrays).",
    "- Use repeat for array iteration from statePath.",
    "- Use on/watch for action bindings with actions setState/pushState/removeState/validateForm.",
    "- Use dynamic expressions in props/action params: {$state}, {$item}, {$index}, {$bindState}, {$bindItem}, {$cond,$then,$else}.",
    "- Return rich, complete UI trees. Do not return empty/skeleton output."
  ].join("\n");
}

export function compilePass2ExampleSnapshotV2(): Record<string, unknown> {
  return PASS2_EXAMPLE_TREE_V2 as unknown as Record<string, unknown>;
}

export function compileOpenAIStructuredOutputSchemaV2(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["tree"],
    properties: {
      state: {
        type: "object",
        additionalProperties: true
      },
      tree: {
        $ref: "#/$defs/UIComponentNodeV2"
      }
    },
    $defs: {
      ActionBinding: {
        type: "object",
        additionalProperties: false,
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: ["setState", "pushState", "removeState", "validateForm"]
          },
          params: {
            type: "object",
            additionalProperties: true
          }
        }
      },
      ActionBindingList: {
        anyOf: [
          { $ref: "#/$defs/ActionBinding" },
          {
            type: "array",
            items: { $ref: "#/$defs/ActionBinding" },
            minItems: 1
          }
        ]
      },
      VisibilityCondition: {
        anyOf: [
          { type: "boolean" },
          {
            type: "object",
            additionalProperties: false,
            required: ["$state"],
            properties: {
              $state: { type: "string" },
              eq: true,
              neq: true,
              gt: { type: "number" },
              gte: { type: "number" },
              lt: { type: "number" },
              lte: { type: "number" },
              not: { type: "boolean" }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["$item"],
            properties: {
              $item: { type: "string" },
              eq: true,
              neq: true,
              gt: { type: "number" },
              gte: { type: "number" },
              lt: { type: "number" },
              lte: { type: "number" },
              not: { type: "boolean" }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["$index"],
            properties: {
              $index: { const: true },
              eq: true,
              neq: true,
              gt: { type: "number" },
              gte: { type: "number" },
              lt: { type: "number" },
              lte: { type: "number" },
              not: { type: "boolean" }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["$and"],
            properties: {
              $and: {
                type: "array",
                items: { $ref: "#/$defs/VisibilityCondition" },
                minItems: 1
              }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["$or"],
            properties: {
              $or: {
                type: "array",
                items: { $ref: "#/$defs/VisibilityCondition" },
                minItems: 1
              }
            }
          },
          {
            type: "array",
            items: { $ref: "#/$defs/VisibilityCondition" },
            minItems: 1
          }
        ]
      },
      RepeatConfig: {
        type: "object",
        additionalProperties: false,
        required: ["statePath"],
        properties: {
          statePath: { type: "string" },
          key: { type: "string" }
        }
      },
      UIComponentNodeV2: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "children"],
        properties: {
          id: { type: "string", minLength: 1 },
          type: { type: "string", enum: [...ALLOWED_COMPONENT_TYPES_V2] },
          props: {
            type: "object",
            additionalProperties: true
          },
          slots: {
            type: "object",
            additionalProperties: {
              type: "array",
              items: { type: "string" }
            }
          },
          visible: { $ref: "#/$defs/VisibilityCondition" },
          repeat: { $ref: "#/$defs/RepeatConfig" },
          on: {
            type: "object",
            additionalProperties: { $ref: "#/$defs/ActionBindingList" }
          },
          watch: {
            type: "object",
            additionalProperties: { $ref: "#/$defs/ActionBindingList" }
          },
          children: {
            type: "array",
            items: {
              anyOf: [{ type: "string" }, { $ref: "#/$defs/UIComponentNodeV2" }]
            }
          }
        }
      }
    }
  };
}

function createGeminiNodeSchemaV2(depth: number): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: "OBJECT",
    required: ["id", "type", "children"],
    properties: {
      id: { type: "STRING" },
      type: { type: "STRING", enum: [...ALLOWED_COMPONENT_TYPES_V2] },
      props: { type: "OBJECT" },
      slots: { type: "OBJECT" },
      visible: {
        anyOf: [{ type: "BOOLEAN" }, { type: "OBJECT" }, { type: "ARRAY" }]
      },
      repeat: {
        type: "OBJECT",
        required: ["statePath"],
        properties: {
          statePath: { type: "STRING" },
          key: { type: "STRING" }
        }
      },
      on: { type: "OBJECT" },
      watch: { type: "OBJECT" }
    }
  };

  const childOptions: Array<Record<string, unknown>> = [{ type: "STRING" }];
  if (depth > 1) {
    childOptions.push(createGeminiNodeSchemaV2(depth - 1));
  }

  (schema.properties as Record<string, unknown>).children = {
    type: "ARRAY",
    items: childOptions.length === 1 ? childOptions[0] : { anyOf: childOptions }
  };

  return schema;
}

export function compileGeminiStructuredOutputSchemaV2(depth = 4): Record<string, unknown> {
  return {
    type: "OBJECT",
    required: ["tree"],
    properties: {
      state: {
        type: "OBJECT"
      },
      tree: createGeminiNodeSchemaV2(depth)
    }
  };
}
