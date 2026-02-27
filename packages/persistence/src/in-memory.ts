import { randomUUID } from "node:crypto";
import type {
  GenerationLogRecord,
  MessageRecord,
  ThreadBundle,
  ThreadRecord,
  VersionRecord
} from "@repo/contracts";
import type {
  CreateThreadInput,
  PersistGenerationInput,
  PersistenceAdapter,
  RecordGenerationFailureInput
} from "./interfaces";

interface ThreadState {
  thread: ThreadRecord;
  messages: MessageRecord[];
  versions: VersionRecord[];
  logs: GenerationLogRecord[];
}

function now() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createInitialSpec(): VersionRecord["specSnapshot"] {
  return {
    root: "",
    elements: {}
  };
}

export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly store = new Map<string, ThreadState>();

  public async createThread(input: CreateThreadInput): Promise<ThreadRecord> {
    const threadId = randomUUID();
    const versionId = randomUUID();
    const timestamp = now();

    const thread: ThreadRecord = {
      threadId,
      title: input.title ?? "Untitled Thread",
      activeVersionId: versionId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const initialVersion: VersionRecord = {
      versionId,
      threadId,
      baseVersionId: null,
      specSnapshot: createInitialSpec(),
      specHash: "",
      mcpContextUsed: [],
      createdAt: timestamp
    };

    this.store.set(threadId, {
      thread: clone(thread),
      messages: [],
      versions: [clone(initialVersion)],
      logs: []
    });

    return clone(thread);
  }

  public async getThreadBundle(threadId: string): Promise<ThreadBundle | null> {
    const state = this.store.get(threadId);
    if (!state) {
      return null;
    }

    return {
      thread: clone(state.thread),
      messages: clone(state.messages),
      versions: clone(state.versions)
    };
  }

  public async getVersion(threadId: string, versionId: string | null): Promise<VersionRecord | null> {
    const state = this.store.get(threadId);
    if (!state) {
      return null;
    }

    if (!versionId) {
      const active =
        state.versions.find((version) => version.versionId === state.thread.activeVersionId) ?? null;
      return active ? clone(active) : null;
    }

    const matched = state.versions.find((version) => version.versionId === versionId) ?? null;
    return matched ? clone(matched) : null;
  }

  public async persistGeneration(
    input: PersistGenerationInput
  ): Promise<{ version: VersionRecord; message: MessageRecord; log: GenerationLogRecord }> {
    const state = this.store.get(input.threadId);
    if (!state) {
      throw new Error(`Thread '${input.threadId}' not found.`);
    }

    const timestamp = now();

    const userMessage: MessageRecord = {
      id: randomUUID(),
      threadId: input.threadId,
      generationId: input.generationId,
      role: "user",
      content: input.prompt,
      createdAt: timestamp
    };

    const assistantMessage: MessageRecord = {
      id: randomUUID(),
      threadId: input.threadId,
      generationId: input.generationId,
      role: "assistant",
      content: input.assistantResponseText,
      createdAt: timestamp,
      meta: {
        warningCount: input.warnings.length,
        patchCount: input.patchCount,
        durationMs: input.durationMs,
        specHash: input.specHash,
        mcpContextUsed: input.mcpContextUsed
      }
    };

    const version: VersionRecord = {
      versionId: randomUUID(),
      threadId: input.threadId,
      baseVersionId: input.baseVersionId,
      specSnapshot: input.specSnapshot,
      specHash: input.specHash,
      mcpContextUsed: input.mcpContextUsed,
      createdAt: timestamp
    };

    const log: GenerationLogRecord = {
      id: randomUUID(),
      generationId: input.generationId,
      threadId: input.threadId,
      warningCount: input.warnings.length,
      patchCount: input.patchCount,
      durationMs: input.durationMs,
      createdAt: timestamp
    };

    state.messages.push(userMessage, assistantMessage);
    state.versions.unshift(version);
    state.logs.push(log);
    state.thread.activeVersionId = version.versionId;
    state.thread.updatedAt = timestamp;

    return clone({
      version,
      message: assistantMessage,
      log
    });
  }

  public async recordGenerationFailure(
    input: RecordGenerationFailureInput
  ): Promise<GenerationLogRecord> {
    const state = this.store.get(input.threadId);
    if (!state) {
      throw new Error(`Thread '${input.threadId}' not found.`);
    }

    const log: GenerationLogRecord = {
      id: randomUUID(),
      generationId: input.generationId,
      threadId: input.threadId,
      warningCount: input.warningCount,
      patchCount: input.patchCount,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      createdAt: now()
    };

    state.logs.push(log);
    return clone(log);
  }

  public async revertThread(threadId: string, targetVersionId: string): Promise<VersionRecord> {
    const state = this.store.get(threadId);
    if (!state) {
      throw new Error(`Thread '${threadId}' not found.`);
    }

    const target = state.versions.find((version) => version.versionId === targetVersionId);
    if (!target) {
      throw new Error(`Version '${targetVersionId}' not found.`);
    }

    const timestamp = now();
    const revertVersion: VersionRecord = {
      versionId: randomUUID(),
      threadId,
      baseVersionId: targetVersionId,
      specSnapshot: structuredClone(target.specSnapshot),
      specHash: target.specHash,
      mcpContextUsed: target.mcpContextUsed,
      createdAt: timestamp
    };

    state.versions.unshift(revertVersion);
    state.thread.activeVersionId = revertVersion.versionId;
    state.thread.updatedAt = timestamp;

    return clone(revertVersion);
  }
}
