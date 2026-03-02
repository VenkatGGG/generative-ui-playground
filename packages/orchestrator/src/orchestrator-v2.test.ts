import { describe, expect, it } from "vitest";
import type { GenerationModelAdapter, MCPAdapter } from "@repo/integrations";
import type { PersistenceAdapter } from "@repo/persistence";
import { runGenerationV2 } from "./orchestrator-v2";

function createDeps(): {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapter;
} {
  const now = new Date().toISOString();

  const persistence: PersistenceAdapter = {
    async createThread() {
      return {
        threadId: "thread-v1",
        title: "Thread v1",
        activeVersionId: "v1",
        createdAt: now,
        updatedAt: now
      };
    },
    async createThreadV2() {
      return {
        threadId: "thread-v2",
        title: "Thread v2",
        activeVersionId: "v2-1",
        createdAt: now,
        updatedAt: now
      };
    },
    async getThreadBundle() {
      return {
        thread: {
          threadId: "thread-v1",
          title: "Thread v1",
          activeVersionId: "v1",
          createdAt: now,
          updatedAt: now
        },
        messages: [],
        versions: []
      };
    },
    async getThreadBundleV2() {
      return {
        thread: {
          threadId: "thread-v2",
          title: "Thread v2",
          activeVersionId: "v2-1",
          createdAt: now,
          updatedAt: now
        },
        messages: [],
        versions: [
          {
            versionId: "v2-1",
            threadId: "thread-v2",
            baseVersionId: null,
            specSnapshot: { root: "", elements: {} },
            specHash: "",
            mcpContextUsed: [],
            schemaVersion: "v2",
            createdAt: now
          }
        ]
      };
    },
    async getVersion() {
      return null;
    },
    async getVersionV2(_threadId, versionId) {
      if (versionId === "missing") {
        return null;
      }
      return {
        versionId: "v2-1",
        threadId: "thread-v2",
        baseVersionId: null,
        specSnapshot: { root: "", elements: {} },
        specHash: "",
        mcpContextUsed: [],
        schemaVersion: "v2",
        createdAt: now
      };
    },
    async persistGeneration(input) {
      return {
        version: {
          versionId: "v1-2",
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
          content: input.assistantResponseText,
          reasoning: input.assistantReasoningText,
          createdAt: now
        },
        log: {
          id: "log1",
          generationId: input.generationId,
          threadId: input.threadId,
          warningCount: input.warnings.length,
          patchCount: input.patchCount,
          durationMs: input.durationMs,
          createdAt: now
        }
      };
    },
    async persistGenerationV2(input) {
      return {
        version: {
          versionId: "v2-2",
          threadId: input.threadId,
          baseVersionId: input.baseVersionId,
          specSnapshot: input.specSnapshot,
          specHash: input.specHash,
          mcpContextUsed: input.mcpContextUsed,
          schemaVersion: "v2",
          createdAt: now
        },
        message: {
          id: "m2",
          threadId: input.threadId,
          generationId: input.generationId,
          role: "assistant",
          content: input.assistantResponseText,
          reasoning: input.assistantReasoningText,
          createdAt: now
        },
        log: {
          id: "log2",
          generationId: input.generationId,
          threadId: input.threadId,
          warningCount: input.warnings.length,
          patchCount: input.patchCount,
          durationMs: input.durationMs,
          createdAt: now
        }
      };
    },
    async recordGenerationFailure(input) {
      return {
        id: "log-f",
        generationId: input.generationId,
        threadId: input.threadId,
        warningCount: input.warningCount,
        patchCount: input.patchCount,
        durationMs: input.durationMs,
        errorCode: input.errorCode,
        createdAt: now
      };
    },
    async revertThread() {
      throw new Error("not used");
    },
    async revertThreadV2() {
      throw new Error("not used");
    }
  };

  const model: GenerationModelAdapter = {
    async extractComponents() {
      return {
        components: ["Card", "CardHeader", "CardTitle", "CardContent", "Text", "Button", "Stack"],
        intentType: "new",
        confidence: 0.95
      };
    },
    async *streamDesign() {
      yield JSON.stringify({
        id: "root",
        type: "Card",
        children: []
      });
    },
    async *streamDesignV2() {
      yield JSON.stringify({
        state: {
          rows: [{ id: "r1", label: "Row 1" }]
        },
        tree: {
          id: "root",
          type: "Card",
          children: [
            {
              id: "header",
              type: "CardHeader",
              children: [
                { id: "title", type: "CardTitle", children: ["Pro Plan"] },
                { id: "desc", type: "CardDescription", children: ["For fast-growing teams"] }
              ]
            },
            {
              id: "content",
              type: "CardContent",
              children: [
                {
                  id: "price",
                  type: "Text",
                  children: ["$29/mo"]
                },
                {
                  id: "rows",
                  type: "Stack",
                  repeat: { statePath: "/rows", key: "id" },
                  children: [
                    {
                      id: "rowText",
                      type: "Text",
                      props: { text: { $item: "label" } },
                      children: []
                    }
                  ]
                },
                {
                  id: "cta",
                  type: "Button",
                  children: ["Continue"]
                },
                {
                  id: "secondary",
                  type: "Button",
                  props: { variant: "outline" },
                  children: ["View Docs"]
                }
              ]
            }
          ]
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

  return { model, mcp, persistence };
}

describe("runGenerationV2", () => {
  it("emits semantic lifecycle events and usage metadata without fallback on rich snapshots", async () => {
    const events = [] as string[];
    const warningCodes: string[] = [];
    for await (const event of runGenerationV2(
      {
        threadId: "thread-v2",
        prompt: "Build a dynamic pricing card",
        baseVersionId: null
      },
      createDeps()
    )) {
      events.push(event.type);
      if (event.type === "warning") {
        warningCodes.push(event.code);
      }
    }

    expect(events).toContain("status");
    expect(events).toContain("patch");
    expect(events).toContain("usage");
    expect(events).toContain("done");
    expect(warningCodes).not.toContain("FALLBACK_APPLIED");
  });

  it("returns base version conflict for stale v2 ids", async () => {
    const events = [] as Array<{ type: string; code?: string }>;
    for await (const event of runGenerationV2(
      {
        threadId: "thread-v2",
        prompt: "Build",
        baseVersionId: "missing"
      },
      createDeps()
    )) {
      events.push({
        type: event.type,
        code: "code" in event ? event.code : undefined
      });
    }

    expect(events).toEqual([{ type: "error", code: "BASE_VERSION_CONFLICT" }]);
  });

  it("retries v2 pass2 using validator feedback before succeeding", async () => {
    const deps = createDeps();
    const prompts: string[] = [];
    let callCount = 0;

    deps.model = {
      ...deps.model,
      async *streamDesignV2(input) {
        prompts.push(input.prompt);
        callCount += 1;

        if (callCount === 1) {
          yield JSON.stringify({
            tree: {
              id: "root",
              type: "Card",
              children: [{ id: "title", type: "CardTitle", children: ["Tiny"] }]
            }
          });
          return;
        }

        yield JSON.stringify({
          state: {
            features: [
              { id: "1", label: "Priority support" },
              { id: "2", label: "Unlimited projects" },
              { id: "3", label: "Team collaboration" }
            ]
          },
          tree: {
            id: "root",
            type: "Card",
            children: [
              {
                id: "header",
                type: "CardHeader",
                children: [
                  { id: "title", type: "CardTitle", children: ["Pro Plan"] },
                  { id: "desc", type: "CardDescription", children: ["For startups"] }
                ]
              },
              {
                id: "content",
                type: "CardContent",
                children: [
                  { id: "price", type: "Text", children: ["$29/mo"] },
                  {
                    id: "feature-list",
                    type: "Stack",
                    repeat: { statePath: "/features", key: "id" },
                    children: [{ id: "feature", type: "Text", props: { text: { $item: "label" } }, children: [] }]
                  },
                  { id: "cta-primary", type: "Button", children: ["Start Free Trial"] },
                  { id: "cta-secondary", type: "Button", props: { variant: "outline" }, children: ["View Docs"] }
                ]
              }
            ]
          }
        });
      }
    };

    const warningCodes: string[] = [];
    const eventTypes: string[] = [];
    for await (const event of runGenerationV2(
      {
        threadId: "thread-v2",
        prompt: "Create a pricing card with title, price, features and CTAs",
        baseVersionId: null
      },
      deps
    )) {
      eventTypes.push(event.type);
      if (event.type === "warning") {
        warningCodes.push(event.code);
      }
    }

    expect(callCount).toBe(2);
    expect(prompts[1]).toContain("Retry attempt 2");
    expect(prompts[1]).toContain("V2_SPARSE_OUTPUT");
    expect(prompts[1]).toContain("V2_CARD_STRUCTURE_MISSING");
    expect(warningCodes).toContain("V2_CARD_STRUCTURE_MISSING");
    expect(warningCodes).toContain("CONSTRAINT_RETRY");
    expect(eventTypes).toContain("done");
  });

  it("emits no-structural-progress warning for repeated sparse candidates and falls back", async () => {
    const deps = createDeps();
    let callCount = 0;

    deps.model = {
      ...deps.model,
      async *streamDesignV2() {
        callCount += 1;
        yield JSON.stringify({
          tree: {
            id: "root",
            type: "Card",
            children: [
              {
                id: "title",
                type: "CardTitle",
                children: ["Tiny"]
              }
            ]
          }
        });
      }
    };

    const warningCodes: string[] = [];
    for await (const event of runGenerationV2(
      {
        threadId: "thread-v2",
        prompt: "Create a pricing card with title, price, features and CTAs",
        baseVersionId: null
      },
      deps
    )) {
      if (event.type === "warning") {
        warningCodes.push(event.code);
      }
    }

    expect(callCount).toBe(3);
    expect(warningCodes).toContain("V2_CARD_STRUCTURE_MISSING");
    expect(warningCodes).toContain("V2_NO_STRUCTURAL_PROGRESS");
    expect(warningCodes).toContain("FALLBACK_APPLIED");
  });
});
