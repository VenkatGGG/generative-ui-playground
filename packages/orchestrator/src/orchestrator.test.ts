import { describe, expect, it } from "vitest";
import type { GenerationModelAdapter, MCPAdapter } from "@repo/integrations";
import type { PersistenceAdapter } from "@repo/persistence";
import { runGeneration } from "./orchestrator";

function createDeps(): {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapter;
} {
  const now = new Date().toISOString();

  const persistence: PersistenceAdapter = {
    async createThread() {
      return {
        threadId: "thread-1",
        title: "Thread",
        activeVersionId: "version-1",
        createdAt: now,
        updatedAt: now
      };
    },
    async getThreadBundle() {
      return {
        thread: {
          threadId: "thread-1",
          title: "Thread",
          activeVersionId: "version-1",
          createdAt: now,
          updatedAt: now
        },
        messages: [],
        versions: []
      };
    },
    async getVersion() {
      return null;
    },
    async persistGeneration(input) {
      return {
        version: {
          versionId: "version-2",
          threadId: input.threadId,
          baseVersionId: input.baseVersionId,
          specSnapshot: input.specSnapshot,
          specHash: input.specHash,
          mcpContextUsed: input.mcpContextUsed,
          createdAt: now
        },
        message: {
          id: "m1",
          threadId: input.threadId,
          generationId: input.generationId,
          role: "assistant",
          content: "ok",
          createdAt: now
        },
        log: {
          id: "log1",
          generationId: input.generationId,
          threadId: input.threadId,
          warningCount: input.warnings.length,
          patchCount: 0,
          createdAt: now
        }
      };
    },
    async revertThread() {
      throw new Error("not used");
    }
  };

  const model: GenerationModelAdapter = {
    async extractComponents() {
      return {
        components: ["Card", "Text", "Button"],
        intentType: "new",
        confidence: 0.9
      };
    },
    async *streamDesign() {
      yield JSON.stringify({
        id: "root",
        type: "Card",
        children: [{ id: "txt", type: "Text", children: ["hello"] }]
      });
    }
  };

  const mcp: MCPAdapter = {
    async fetchContext() {
      return {
        contextVersion: "stub-v1",
        componentRules: []
      };
    }
  };

  return { model, mcp, persistence };
}

describe("runGeneration", () => {
  it("emits lifecycle and done events", async () => {
    const events = [] as string[];

    for await (const event of runGeneration(
      {
        threadId: "thread-1",
        prompt: "build card",
        baseVersionId: null
      },
      createDeps()
    )) {
      events.push(event.type);
    }

    expect(events[0]).toBe("status");
    expect(events.includes("done")).toBe(true);
  });
});
