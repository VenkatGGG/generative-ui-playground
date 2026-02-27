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
    expect(persisted.log.patchCount).toBe(2);
    expect(persisted.log.durationMs).toBe(12);
    expect(failureLog.errorCode).toBe("GENERATION_EXCEPTION");
    expect(failureLog.durationMs).toBe(4);
    expect(bundle?.versions.length).toBeGreaterThan(0);
    expect(bundle?.messages.length).toBeGreaterThan(0);
  });
});
