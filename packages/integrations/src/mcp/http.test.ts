import { describe, expect, it, vi } from "vitest";
import { createMcpHttpAdapter } from "./http";

describe("createMcpHttpAdapter", () => {
  it("fetches and normalizes component context", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          contextVersion: "ctx-v2",
          componentRules: [
            {
              name: "Card",
              allowedProps: ["className", "variant"],
              variants: ["default", "outline"],
              notes: "Card layout rules"
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
    );

    const adapter = createMcpHttpAdapter({
      endpoint: "https://mcp.example.com/context",
      apiKey: "secret",
      fetchImpl
    });

    const context = await adapter.fetchContext(["Card"]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(context.contextVersion).toBe("ctx-v2");
    expect(context.componentRules).toEqual([
      {
        name: "Card",
        allowedProps: ["className", "variant"],
        variants: ["default", "outline"],
        notes: "Card layout rules"
      }
    ]);
  });

  it("falls back to requested components when server returns empty rules", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          contextVersion: "ctx-v3",
          componentRules: []
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

    const adapter = createMcpHttpAdapter({
      endpoint: "https://mcp.example.com/context",
      fetchImpl
    });

    const context = await adapter.fetchContext(["Button", "Badge"]);

    expect(context.componentRules).toHaveLength(2);
    expect(context.componentRules[0]?.name).toBe("Button");
    expect(context.componentRules[1]?.name).toBe("Badge");
  });
});
