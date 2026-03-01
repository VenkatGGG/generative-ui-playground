import type { GenerationModelAdapter, StreamDesignInput } from "../interfaces";

function buildSnapshot(prompt: string, cta: string) {
  return {
    id: "root",
    type: "Card",
    children: [
      {
        id: "header",
        type: "CardHeader",
        children: [
          { id: "title", type: "CardTitle", children: ["Generated UI"] },
          {
            id: "description",
            type: "CardDescription",
            children: [prompt.slice(0, 120)]
          }
        ]
      },
      {
        id: "content",
        type: "CardContent",
        children: [{ id: "cta", type: "Button", children: [cta] }]
      }
    ]
  };
}

function buildSnapshotV2(prompt: string, cta: string) {
  return {
    state: {
      features: [
        { id: "f1", label: "Unlimited projects" },
        { id: "f2", label: "Priority support" }
      ],
      form: {
        email: "",
        accepted: false
      }
    },
    tree: {
      id: "root",
      type: "Card",
      children: [
        {
          id: "header",
          type: "CardHeader",
          children: [
            { id: "title", type: "CardTitle", children: ["Generated UI"] },
            {
              id: "description",
              type: "CardDescription",
              children: [prompt.slice(0, 120)]
            }
          ]
        },
        {
          id: "content",
          type: "CardContent",
          children: [
            {
              id: "features",
              type: "Stack",
              repeat: {
                statePath: "/features",
                key: "id"
              },
              children: [
                {
                  id: "feature",
                  type: "Text",
                  props: {
                    text: { $item: "label" }
                  }
                }
              ]
            },
            {
              id: "email",
              type: "Input",
              props: {
                placeholder: "Work email",
                value: { $bindState: "/form/email" }
              }
            },
            {
              id: "cta",
              type: "Button",
              on: {
                press: {
                  action: "validateForm",
                  params: {
                    path: "/form",
                    required: ["email"]
                  }
                }
              },
              children: [cta]
            }
          ]
        }
      ]
    }
  };
}

async function* buildSnapshots(input: StreamDesignInput): AsyncIterable<string> {
  const base = buildSnapshot(input.prompt, "Working...");
  yield `${JSON.stringify(base)}\n`;

  const final = buildSnapshot(
    input.prompt,
    input.previousSpec ? "Refined" : "Create Next Iteration"
  );
  yield `${JSON.stringify(final)}\n`;
}

async function* buildSnapshotsV2(input: StreamDesignInput): AsyncIterable<string> {
  const base = buildSnapshotV2(input.prompt, "Working...");
  yield `${JSON.stringify(base)}\n`;

  const final = buildSnapshotV2(
    input.prompt,
    input.previousSpec ? "Refined" : "Create Next Iteration"
  );
  yield `${JSON.stringify(final)}\n`;
}

export function createStubGenerationModel(): GenerationModelAdapter {
  return {
    async extractComponents() {
      return {
        components: [
          "Card",
          "CardHeader",
          "CardTitle",
          "CardDescription",
          "CardContent",
          "Button",
          "Text"
        ],
        intentType: "new",
        confidence: 0.88
      };
    },
    streamDesign(input) {
      return buildSnapshots(input);
    },
    streamDesignV2(input) {
      return buildSnapshotsV2(input);
    }
  };
}
