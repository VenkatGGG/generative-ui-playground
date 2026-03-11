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

  it("retries transient pass1 failures before succeeding", async () => {
    let callCount = 0;
    const fetchImpl: typeof fetch = async () => {
      callCount += 1;

      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: 503,
              status: "UNAVAILABLE"
            }
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      components: ["Card", "Input", "Button"],
                      intentType: "new",
                      confidence: 0.96
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
      prompt: "build a contact form",
      previousSpec: null
    });

    expect(callCount).toBe(2);
    expect(result.components).toEqual(["Card", "Input", "Button"]);
    expect(result.intentType).toBe("new");
    expect(result.confidence).toBe(0.96);
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
      expect(body.generationConfig?.maxOutputTokens).toBe(4096);
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
      expect(body.generationConfig?.maxOutputTokens).toBe(4096);
      expect(body.generationConfig?.thinkingConfig?.thinkingLevel).toBe("LOW");
      const responseSchema = body.generationConfig?.responseSchema as
        | { properties?: { tree?: { required?: string[]; properties?: Record<string, unknown> } } }
        | undefined;
      expect(responseSchema?.properties?.tree?.required).toContain("children");
      const visible = responseSchema?.properties?.tree?.properties?.visible as
        | { anyOf?: Array<Record<string, unknown>> }
        | undefined;
      const visibleArrayArm = visible?.anyOf?.find((entry) => entry.type === "ARRAY");
      expect(visibleArrayArm?.items).toBeDefined();
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

  it("retries transient stream transport failures before succeeding", async () => {
    const ssePayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"state\\":{},\\"tree\\":{\\"id\\":\\"root\\",\\"type\\":\\"Card\\",\\"children\\":[]}}"}]}}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");

    let callCount = 0;
    const fetchImpl: typeof fetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new TypeError("fetch failed");
      }

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
      prompt: "build a pricing card using CardHeader and CardFooter",
      previousSpec: null,
      componentContext: {
        contextVersion: "ctx-v2",
        componentRules: []
      }
    })) {
      chunks.push(chunk);
    }

    expect(callCount).toBe(2);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('"tree"');
  });

  it("retries pass2 with a larger output budget when gemini stops at max tokens", async () => {
    const truncatedPayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"tree\\":{\\"id\\":\\"root\\""}]}}]}',
      "",
      'data: {"candidates":[{"content":{"parts":[{"text":""}]},"finishReason":"MAX_TOKENS"}]}',
      ""
    ].join("\n");
    const completePayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"tree\\":{\\"id\\":\\"root\\",\\"type\\":\\"Card\\",\\"children\\":[]}}"}]}}]}',
      "",
      'data: {"candidates":[{"content":{"parts":[{"text":""}]},"finishReason":"STOP"}]}',
      ""
    ].join("\n");

    const outputBudgets: number[] = [];
    let callCount = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body)) as {
        generationConfig?: { maxOutputTokens?: number };
      };
      outputBudgets.push(body.generationConfig?.maxOutputTokens ?? 0);

      return new Response(callCount === 1 ? truncatedPayload : completePayload, {
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
      prompt: "build a pricing card",
      previousSpec: null,
      componentContext: {
        contextVersion: "ctx-v2",
        componentRules: []
      }
    })) {
      chunks.push(chunk);
    }

    expect(callCount).toBe(2);
    expect(outputBudgets).toEqual([4096, 8192]);
    expect(chunks).toEqual(['{"tree":{"id":"root","type":"Card","children":[]}}']);
  });
});
