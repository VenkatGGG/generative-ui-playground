import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationModelAdapter, MCPAdapter } from "@repo/integrations";
import type { PersistenceAdapter } from "@repo/persistence";

const originalEnv = { ...process.env };

interface StreamEventLike {
  type: string;
  code?: string;
}

async function readSseEvents(response: Response): Promise<StreamEventLike[]> {
  const text = await response.text();
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));

  return lines.map((line) => JSON.parse(line.replace(/^data:\s*/, "")) as StreamEventLike);
}

describe("v2 generate route", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ADAPTER_MODE: "stub"
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("streams status/patch/usage/done events without fallback for rich snapshots", async () => {
    const { POST: createThread } = await import("../threads/route");
    const { POST: generate } = await import("./route");

    const createResponse = await createThread(
      new Request("http://localhost/api/v2/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Generate Thread V2" })
      })
    );

    const created = (await createResponse.json()) as { thread: { threadId: string; activeVersionId: string } };

    const response = await generate(
      new Request("http://localhost/api/v2/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        },
        body: JSON.stringify({
          threadId: created.thread.threadId,
          prompt: "Create semantic pricing card",
          baseVersionId: created.thread.activeVersionId
        })
      })
    );

    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    const warningCodes = events
      .filter((event): event is { type: "warning"; code: string } => event.type === "warning" && !!event.code)
      .map((event) => event.code);

    expect(events.some((event) => event.type === "status")).toBe(true);
    expect(events.some((event) => event.type === "patch")).toBe(true);
    expect(events.some((event) => event.type === "usage")).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(warningCodes).not.toContain("FALLBACK_APPLIED");
  });

  it("emits sparse/fallback warning taxonomy for repeated sparse candidates", async () => {
    process.env = {
      ...originalEnv,
      ADAPTER_MODE: "real",
      MONGODB_URI: "mongodb://localhost:27017",
      MONGODB_DB_NAME: "genui",
      GEMINI_API_KEY: "test-key"
    };

    const { InMemoryPersistenceAdapter } = await import("@repo/persistence");
    const persistence: PersistenceAdapter = new InMemoryPersistenceAdapter();
    const thread = await persistence.createThreadV2("Route fallback thread");

    const model: GenerationModelAdapter = {
      async extractComponents() {
        return {
          components: ["Card", "CardHeader", "CardContent", "Button"],
          intentType: "new",
          confidence: 0.95
        };
      },
      async *streamDesign() {
        yield JSON.stringify({ id: "root", type: "Card", children: [] });
      },
      async *streamDesignV2() {
        yield JSON.stringify({
          tree: {
            id: "root",
            type: "Card",
            children: [{ id: "title", type: "CardTitle", children: ["Tiny"] }]
          }
        });
      }
    };

    const mcp: MCPAdapter = {
      async fetchContext(componentNames) {
        return {
          contextVersion: "ctx-v2",
          componentRules: componentNames.map((name) => ({
            name,
            allowedProps: [],
            variants: [],
            compositionRules: [],
            supportedEvents: [],
            bindingHints: [],
            notes: ""
          }))
        };
      }
    };

    vi.doMock("@/lib/server/runtime", () => ({
      getRuntimeDeps: async () => ({
        model,
        mcp,
        persistence
      })
    }));

    const { POST: generate } = await import("./route");
    const response = await generate(
      new Request("http://localhost/api/v2/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        },
        body: JSON.stringify({
          threadId: thread.threadId,
          prompt: "Create a pricing card with title, price, features and CTAs",
          baseVersionId: thread.activeVersionId
        })
      })
    );

    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    const warningCodes = events
      .filter((event): event is { type: "warning"; code: string } => event.type === "warning" && !!event.code)
      .map((event) => event.code);

    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(warningCodes).toContain("V2_SPARSE_OUTPUT");
    expect(warningCodes).toContain("V2_CARD_STRUCTURE_MISSING");
    expect(warningCodes).toContain("V2_NO_STRUCTURAL_PROGRESS");
    expect(warningCodes).toContain("FALLBACK_APPLIED");
  });
});
