import { ALLOWED_COMPONENT_TYPES, ALLOWED_COMPONENT_TYPES_V2 } from "@repo/component-catalog";

export const ALLOWED_UI_COMPONENT_TYPES = ALLOWED_COMPONENT_TYPES;

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

const ACTION_BINDING_SCHEMA = {
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
} as const;

export const UI_TREE_SNAPSHOT_V2_JSON_SCHEMA: Record<string, unknown> = {
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
    ActionBinding: ACTION_BINDING_SCHEMA,
    ActionBindingList: {
      anyOf: [{ $ref: "#/$defs/ActionBinding" }, { type: "array", items: { $ref: "#/$defs/ActionBinding" } }]
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
          required: ["$and"],
          properties: {
            $and: {
              type: "array",
              items: { $ref: "#/$defs/VisibilityCondition" }
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
              items: { $ref: "#/$defs/VisibilityCondition" }
            }
          }
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
      required: ["id", "type"],
      properties: {
        id: { type: "string", minLength: 1 },
        type: {
          type: "string",
          enum: [...ALLOWED_COMPONENT_TYPES_V2]
        },
        props: {
          type: "object",
          additionalProperties: true
        },
        visible: {
          $ref: "#/$defs/VisibilityCondition"
        },
        repeat: {
          $ref: "#/$defs/RepeatConfig"
        },
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
