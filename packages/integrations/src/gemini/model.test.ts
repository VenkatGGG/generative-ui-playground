import { describe, expect, it } from "vitest";
import { createGeminiGenerationModel } from "./model";

describe("createGeminiGenerationModel", () => {
  it("extracts component list using pass1 response", async () => {
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        generationConfig?: { responseMimeType?: string; responseSchema?: unknown };
      };

      expect(body.generationConfig?.responseMimeType).toBe("application/json");
      expect(body.generationConfig?.responseSchema).toBeUndefined();

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      components: ["Card", "Button"],
                      intentType: "modify",
                      confidence: 0.91
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
      );
    };

    const adapter = createGeminiGenerationModel({
      apiKey: "test-key",
      fetchImpl
    });

    const result = await adapter.extractComponents({
      prompt: "add a blue button",
      previousSpec: null
    });

    expect(result.components).toEqual(["Card", "Button"]);
    expect(result.intentType).toBe("modify");
    expect(result.confidence).toBe(0.91);
  });

  it("streams pass2 chunks from gemini sse payload", async () => {
    const ssePayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"id\\":\\"root\\",\\"type\\":\\"Card\\"}\\n"}]}}]}',
      "",
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"id\\":\\"root\\",\\"type\\":\\"Card\\",\\"children\\":[]}\\n"}]}}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");

    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        generationConfig?: { responseSchema?: unknown };
      };

      expect(body.generationConfig?.responseSchema).toBeDefined();
      expect(body.generationConfig?.responseSchema).not.toHaveProperty("$schema");
      expect(body.generationConfig?.responseSchema).not.toHaveProperty("$ref");
      expect(body.generationConfig?.responseSchema).not.toHaveProperty("$defs");

      return new Response(ssePayload, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      });
    };

    const adapter = createGeminiGenerationModel({
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

  it("streams v2 semantic snapshots with provider schema constraints", async () => {
    const ssePayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"state\\":{},\\"tree\\":{\\"id\\":\\"root\\",\\"type\\":\\"Card\\"}}\\n"}]}}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");

    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        generationConfig?: { responseSchema?: unknown };
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
      };

      expect(body.generationConfig?.responseSchema).toBeDefined();
      const prompt = body.contents?.[0]?.parts?.[0]?.text ?? "";
      expect(prompt).toContain("SEMANTIC CONTRACT");
      expect(prompt).toContain("visible");
      expect(prompt).toContain("repeat");
      expect(prompt).toContain("on for events");

      return new Response(ssePayload, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      });
    };

    const adapter = createGeminiGenerationModel({
      apiKey: "test-key",
      fetchImpl
    });

    const chunks: string[] = [];
    for await (const chunk of adapter.streamDesignV2!({
      prompt: "build a dynamic pricing form",
      previousSpec: null,
      componentContext: {
        contextVersion: "ctx-v2",
        componentRules: []
      }
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('"tree"');
  });
});
