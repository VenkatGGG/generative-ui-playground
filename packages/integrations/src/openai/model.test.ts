import { describe, expect, it } from "vitest";
import { createOpenAIGenerationModel } from "./model";

describe("createOpenAIGenerationModel", () => {
  it("extracts component list using pass1 response", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  components: ["Card", "Button"],
                  intentType: "modify",
                  confidence: 0.87
                })
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

    const adapter = createOpenAIGenerationModel({
      apiKey: "test-key",
      fetchImpl
    });

    const result = await adapter.extractComponents({
      prompt: "add a button",
      previousSpec: null
    });

    expect(result.components).toEqual(["Card", "Button"]);
    expect(result.intentType).toBe("modify");
    expect(result.confidence).toBe(0.87);
  });

  it("streams pass2 chunks from openai sse payload", async () => {
    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"{\\"id\\":\\"root\\",\\"type\\":\\"Card\\"}\\n"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"{\\"id\\":\\"root\\",\\"type\\":\\"Card\\",\\"children\\":[]}\\n"}}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");

    const fetchImpl: typeof fetch = async () =>
      new Response(ssePayload, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      });

    const adapter = createOpenAIGenerationModel({
      apiKey: "test-key",
      fetchImpl
    });

    const chunks: string[] = [];
    for await (const chunk of adapter.streamDesign({
      prompt: "build a card",
      previousSpec: null,
      componentContext: {
        contextVersion: "ctx-v1",
        componentRules: []
      }
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('"type":"Card"');
    expect(chunks[1]).toContain('"children":[]');
  });
});
