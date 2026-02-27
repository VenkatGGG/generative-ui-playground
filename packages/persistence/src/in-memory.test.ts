import { describe, expect, it } from "vitest";
import { InMemoryPersistenceAdapter } from "./in-memory";

describe("InMemoryPersistenceAdapter", () => {
  it("creates threads and persists generations", async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const thread = await adapter.createThread({ title: "Demo" });

    const persisted = await adapter.persistGeneration({
      threadId: thread.threadId,
      generationId: "g1",
      prompt: "Build card",
      assistantResponseText: "{\"id\":\"root\",\"type\":\"Card\"}",
      baseVersionId: null,
      specSnapshot: {
        root: "root",
        elements: {
          root: { type: "Card", props: {}, children: [] }
        }
      },
      specHash: "hash",
      mcpContextUsed: ["Card"],
      warnings: [],
      patchCount: 2,
      durationMs: 12
    });

    const failureLog = await adapter.recordGenerationFailure({
      threadId: thread.threadId,
      generationId: "g2",
      warningCount: 1,
      patchCount: 0,
      durationMs: 4,
      errorCode: "GENERATION_EXCEPTION"
    });

    const bundle = await adapter.getThreadBundle(thread.threadId);

    expect(persisted.version.threadId).toBe(thread.threadId);
    expect(persisted.message.content).toContain("\"type\":\"Card\"");
    expect(persisted.log.patchCount).toBe(2);
    expect(persisted.log.durationMs).toBe(12);
    expect(persisted.message.meta?.patchCount).toBe(2);
    expect(persisted.message.meta?.durationMs).toBe(12);
    expect(persisted.message.meta?.specHash).toBe("hash");
    expect(failureLog.errorCode).toBe("GENERATION_EXCEPTION");
    expect(failureLog.durationMs).toBe(4);
    expect(bundle?.versions.length).toBeGreaterThan(0);
    expect(bundle?.messages.length).toBeGreaterThan(0);
  });

  it("returns defensive copies to prevent external mutation of stored state", async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const thread = await adapter.createThread({ title: "Mutation Test" });

    const bundleA = await adapter.getThreadBundle(thread.threadId);
    if (!bundleA) {
      throw new Error("Expected bundle to exist");
    }

    bundleA.thread.title = "Mutated";
    bundleA.versions[0]!.specHash = "tampered";

    const bundleB = await adapter.getThreadBundle(thread.threadId);
    if (!bundleB) {
      throw new Error("Expected bundle to exist");
    }

    expect(bundleB.thread.title).toBe("Mutation Test");
    expect(bundleB.versions[0]!.specHash).toBe("");
  });
});
