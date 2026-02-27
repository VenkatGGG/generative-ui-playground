import { describe, expect, it } from "vitest";
import { createGenerationModelAdapter } from "./factory";

describe("createGenerationModelAdapter", () => {
  it("creates gemini adapter", async () => {
    const adapter = createGenerationModelAdapter({
      provider: "gemini",
      options: {
        apiKey: "test-key",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          components: ["Card"],
                          intentType: "new",
                          confidence: 0.9
                        })
                      }
                    ]
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
          )
      }
    });

    const result = await adapter.extractComponents({
      prompt: "build card",
      previousSpec: null
    });

    expect(result.components).toEqual(["Card"]);
  });

  it("creates openai adapter", async () => {
    const adapter = createGenerationModelAdapter({
      provider: "openai",
      options: {
        apiKey: "test-key",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      components: ["Button"],
                      intentType: "modify",
                      confidence: 0.8
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
          )
      }
    });

    const result = await adapter.extractComponents({
      prompt: "add button",
      previousSpec: null
    });

    expect(result.components).toEqual(["Button"]);
  });
});
