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
        type: { type: "string", minLength: 1 },
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
