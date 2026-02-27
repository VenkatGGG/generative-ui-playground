export const ALLOWED_UI_COMPONENT_TYPES = [
  "Card",
  "CardHeader",
  "CardTitle",
  "CardDescription",
  "CardContent",
  "Button",
  "Badge",
  "Text"
] as const;

export const UI_COMPONENT_NODE_JSON_SCHEMA: Record<string, unknown> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $ref: "#/$defs/UIComponentNode",
  $defs: {
    UIComponentNode: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type"],
      properties: {
        id: { type: "string", minLength: 1 },
        type: {
          type: "string",
          enum: [...ALLOWED_UI_COMPONENT_TYPES]
        },
        props: {
          type: "object",
          additionalProperties: true
        },
        children: {
          type: "array",
          items: {
            anyOf: [{ type: "string" }, { $ref: "#/$defs/UIComponentNode" }]
          }
        }
      }
    }
  }
};
