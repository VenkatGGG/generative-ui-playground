import { describe, expect, it } from "vitest";
import type { GenerationModelAdapter, MCPAdapter } from "@repo/integrations";
import type { PersistenceAdapter } from "@repo/persistence";
import { runGeneration } from "./orchestrator";

function buildDeepNode(depth: number): Record<string, unknown> {
  if (depth <= 0) {
    return {
      id: "leaf",
      type: "Text",
      children: ["leaf"]
    };
  }

  return {
    id: `node-${depth}`,
    type: "Card",
    children: [buildDeepNode(depth - 1)]
  };
}

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
          patchCount: input.patchCount,
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

  it("returns base version conflict for stale version ids", async () => {
    const events = [] as Array<{ type: string; code?: string }>;

    for await (const event of runGeneration(
      {
        threadId: "thread-1",
        prompt: "build card",
        baseVersionId: "missing-version"
      },
      createDeps()
    )) {
      events.push({
        type: event.type,
        code: "code" in event ? event.code : undefined
      });
    }

    expect(events).toEqual([
      {
        type: "error",
        code: "BASE_VERSION_CONFLICT"
      }
    ]);
  });

  it("stops generation when validation limits are exceeded", async () => {
    const deps = createDeps();
    let persisted = false;

    deps.model = {
      ...deps.model,
      async *streamDesign() {
        yield `${JSON.stringify(buildDeepNode(34))}\n`;
      }
    };

    deps.persistence = {
      ...deps.persistence,
      async persistGeneration() {
        persisted = true;
        throw new Error("should not persist");
      }
    };

    const events = [] as Array<{ type: string; code?: string }>;

    for await (const event of runGeneration(
      {
        threadId: "thread-1",
        prompt: "build a deeply nested tree",
        baseVersionId: null
      },
      deps
    )) {
      events.push({
        type: event.type,
        code: "code" in event ? event.code : undefined
      });
    }

    expect(events.some((event) => event.type === "error" && event.code === "MAX_DEPTH_EXCEEDED")).toBe(
      true
    );
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(persisted).toBe(false);
  });

  it("handles partial chunked json objects without newline delimiters", async () => {
    const deps = createDeps();

    deps.model = {
      ...deps.model,
      async *streamDesign() {
        yield '{\"id\":\"root\",\"type\":\"Card\",\"children\":[{\"id\":\"txt\",\"type\":\"Text\",\"children\":[\"hel';
        yield 'lo\"]}]}{\"id\":\"root\",\"type\":\"Card\",\"children\":[{\"id\":\"txt\",\"type\":\"Text\",\"children\":[\"hello v2\"]}]}';
      }
    };

    const events: string[] = [];
    let patchCount = 0;

    for await (const event of runGeneration(
      {
        threadId: "thread-1",
        prompt: "build from chunked stream",
        baseVersionId: null
      },
      deps
    )) {
      events.push(event.type);
      if (event.type === "patch") {
        patchCount += 1;
      }
    }

    expect(events.includes("done")).toBe(true);
    expect(events.includes("error")).toBe(false);
    expect(patchCount).toBeGreaterThan(0);
  });
});
