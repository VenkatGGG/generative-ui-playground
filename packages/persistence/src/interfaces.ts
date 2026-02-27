import type {
  GenerationLogRecord,
  MessageRecord,
  ThreadBundle,
  ThreadRecord,
  UISpec,
  VersionRecord
} from "@repo/contracts";

export interface CreateThreadInput {
  title?: string;
}

export interface PersistGenerationInput {
  threadId: string;
  generationId: string;
  prompt: string;
  assistantResponseText: string;
  baseVersionId: string | null;
  specSnapshot: UISpec;
  specHash: string;
  mcpContextUsed: string[];
  warnings: Array<{ code: string; message: string }>;
  patchCount: number;
  durationMs: number;
}

export interface RecordGenerationFailureInput {
  threadId: string;
  generationId: string;
  warningCount: number;
  patchCount: number;
  durationMs: number;
  errorCode: string;
}

export interface PersistenceAdapter {
  createThread(input: CreateThreadInput): Promise<ThreadRecord>;
  getThreadBundle(threadId: string): Promise<ThreadBundle | null>;
  getVersion(threadId: string, versionId: string | null): Promise<VersionRecord | null>;
  persistGeneration(input: PersistGenerationInput): Promise<{ version: VersionRecord; message: MessageRecord; log: GenerationLogRecord }>;
  recordGenerationFailure(input: RecordGenerationFailureInput): Promise<GenerationLogRecord>;
  revertThread(threadId: string, targetVersionId: string): Promise<VersionRecord>;
}
