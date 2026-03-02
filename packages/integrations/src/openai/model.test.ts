import { describe, expect, it } from "vitest";
import { createOpenAIGenerationModel } from "./model";

describe("createOpenAIGenerationModel", () => {
  it("extracts component list using pass1 response", async () => {
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        response_format?: { type?: string };
      };
      expect(body.response_format?.type).toBe("json_object");

      return new Response(
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
    };

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

    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        response_format?: {
          type?: string;
          json_schema?: { strict?: boolean; schema?: unknown };
        };
      };

      expect(body.response_format?.type).toBe("json_schema");
      expect(body.response_format?.json_schema?.strict).toBe(true);
      expect(body.response_format?.json_schema?.schema).toBeDefined();

      return new Response(ssePayload, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      });
    };

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

  it("streams v2 semantic snapshots with json_schema strict mode", async () => {
    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"{\\"state\\":{},\\"tree\\":{\\"id\\":\\"root\\",\\"type\\":\\"Card\\"}}\\n"}}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");

    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages?: Array<{ content?: string }>;
        response_format?: {
          type?: string;
          json_schema?: { strict?: boolean; schema?: unknown };
        };
      };

      expect(body.response_format?.type).toBe("json_schema");
      expect(body.response_format?.json_schema?.strict).toBe(true);
      expect(body.response_format?.json_schema?.schema).toBeDefined();
      const schema = body.response_format?.json_schema?.schema as
        | { $defs?: { UIComponentNodeV2?: { required?: string[] } } }
        | undefined;
      expect(schema?.$defs?.UIComponentNodeV2?.required).toContain("children");
      expect(body.messages?.[0]?.content ?? "").toContain("SEMANTIC CONTRACT");
      expect(body.messages?.[0]?.content ?? "").toContain("PROMPT PACK:");
      expect(body.messages?.[0]?.content ?? "").toContain("GOOD_EXAMPLE_1");
      expect(body.messages?.[0]?.content ?? "").toContain("ANTI-SKELETON");
      expect(body.messages?.[0]?.content ?? "").toContain("Output exactly one JSON object");
      expect(body.messages?.[0]?.content ?? "").toContain("Do not output multiple root JSON objects");
      expect(body.messages?.[0]?.content ?? "").not.toContain(
        "Output newline-delimited JSON objects only."
      );

      return new Response(ssePayload, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      });
    };

    const adapter = createOpenAIGenerationModel({
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
