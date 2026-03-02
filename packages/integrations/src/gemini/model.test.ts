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
        generationConfig?: {
          responseSchema?: unknown;
          maxOutputTokens?: number;
          thinkingConfig?: { thinkingLevel?: string };
        };
      };

      expect(body.generationConfig?.responseSchema).toBeDefined();
      expect(body.generationConfig?.maxOutputTokens).toBe(2048);
      expect(body.generationConfig?.thinkingConfig?.thinkingLevel).toBe("LOW");
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
        generationConfig?: {
          responseSchema?: unknown;
          maxOutputTokens?: number;
          thinkingConfig?: { thinkingLevel?: string };
        };
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
      };

      expect(body.generationConfig?.responseSchema).toBeDefined();
      expect(body.generationConfig?.maxOutputTokens).toBe(2048);
      expect(body.generationConfig?.thinkingConfig?.thinkingLevel).toBe("LOW");
      const responseSchema = body.generationConfig?.responseSchema as
        | { properties?: { tree?: { required?: string[] } } }
        | undefined;
      expect(responseSchema?.properties?.tree?.required).toContain("children");
      const prompt = body.contents?.[0]?.parts?.[0]?.text ?? "";
      expect(prompt).toContain("SEMANTIC CONTRACT");
      expect(prompt).toContain("PROMPT PACK:");
      expect(prompt).toContain("GOOD_EXAMPLE_1");
      expect(prompt).toContain("ANTI-SKELETON");
      expect(prompt).toContain("Output exactly one JSON object");
      expect(prompt).toContain("Do not output multiple root JSON objects");
      expect(prompt).not.toContain("Output newline-delimited JSON objects only.");
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

  it("applies custom pass2 output and thinking controls", async () => {
    const ssePayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"state\\":{},\\"tree\\":{\\"id\\":\\"root\\",\\"type\\":\\"Card\\"}}\\n"}]}}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");

    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        generationConfig?: {
          maxOutputTokens?: number;
          thinkingConfig?: { thinkingLevel?: string };
        };
      };

      expect(body.generationConfig?.maxOutputTokens).toBe(3072);
      expect(body.generationConfig?.thinkingConfig?.thinkingLevel).toBe("MEDIUM");

      return new Response(ssePayload, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      });
    };

    const adapter = createGeminiGenerationModel({
      apiKey: "test-key",
      pass2MaxOutputTokens: 3072,
      pass2ThinkingLevel: "MEDIUM",
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
  });
});
