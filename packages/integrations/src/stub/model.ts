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

async function* buildSnapshots(input: StreamDesignInput): AsyncIterable<string> {
  const base = buildSnapshot(input.prompt, "Working...");
  yield `${JSON.stringify(base)}\n`;

  const final = buildSnapshot(
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
    }
  };
}
