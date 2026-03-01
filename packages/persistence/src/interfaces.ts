import type {
  GenerationLogRecord,
  MessageRecord,
  ThreadBundle,
  ThreadBundleV2,
  ThreadRecord,
  UISpec,
  UISpecV2,
  VersionRecord
} from "@repo/contracts";
import type { VersionRecordV2 } from "@repo/contracts";

export interface CreateThreadInput {
  title?: string;
}

export interface PersistGenerationInput {
  threadId: string;
  generationId: string;
  prompt: string;
  assistantResponseText: string;
  assistantReasoningText: string;
  baseVersionId: string | null;
  specSnapshot: UISpec;
  specHash: string;
  mcpContextUsed: string[];
  warnings: Array<{ code: string; message: string }>;
  patchCount: number;
  durationMs: number;
}

export interface PersistGenerationV2Input {
  threadId: string;
  generationId: string;
  prompt: string;
  assistantResponseText: string;
  assistantReasoningText: string;
  baseVersionId: string | null;
  specSnapshot: UISpecV2;
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
  createThreadV2(input: CreateThreadInput): Promise<ThreadRecord>;
  getThreadBundleV2(threadId: string): Promise<ThreadBundleV2 | null>;
  getVersionV2(threadId: string, versionId: string | null): Promise<VersionRecordV2 | null>;
  persistGenerationV2(
    input: PersistGenerationV2Input
  ): Promise<{ version: VersionRecordV2; message: MessageRecord; log: GenerationLogRecord }>;
  revertThreadV2(threadId: string, targetVersionId: string): Promise<VersionRecordV2>;
}
