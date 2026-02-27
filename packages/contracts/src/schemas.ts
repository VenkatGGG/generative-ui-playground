import { z } from "zod";
import type { StreamEvent } from "./types";

export const JsonPatchSchema = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: z.string().min(1),
  from: z.string().optional(),
  value: z.unknown().optional()
});

export const UIComponentNodeSchema: z.ZodType<{
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: Array<unknown>;
}> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    props: z.record(z.unknown()).optional(),
    children: z.array(z.union([z.string(), UIComponentNodeSchema])).optional()
  })
);

export const UISpecElementSchema = z.object({
  type: z.string().min(1),
  props: z.record(z.unknown()),
  children: z.array(z.string()),
  visible: z.unknown().optional(),
  on: z
    .record(
      z.object({
        action: z.string().min(1),
        params: z.record(z.unknown()).optional()
      })
    )
    .optional()
});

export const UISpecSchema = z.object({
  root: z.string(),
  elements: z.record(UISpecElementSchema),
  state: z.record(z.unknown()).optional()
});

export const GenerateRequestSchema = z.object({
  threadId: z.string().min(1),
  prompt: z.string().min(1),
  baseVersionId: z.string().nullable()
});

export const StreamEventSchema: z.ZodType<StreamEvent> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), generationId: z.string(), stage: z.string() }),
  z.object({ type: z.literal("patch"), generationId: z.string(), patch: JsonPatchSchema }),
  z.object({
    type: z.literal("warning"),
    generationId: z.string(),
    code: z.string(),
    message: z.string()
  }),
  z.object({
    type: z.literal("done"),
    generationId: z.string(),
    versionId: z.string(),
    specHash: z.string()
  }),
  z.object({
    type: z.literal("error"),
    generationId: z.string(),
    code: z.string(),
    message: z.string()
  })
]);

export const CreateThreadRequestSchema = z.object({
  title: z.string().optional()
});

export const RevertRequestSchema = z.object({
  versionId: z.string().min(1)
});

export const ThreadRecordSchema = z.object({
  threadId: z.string(),
  title: z.string(),
  activeVersionId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const MessageRecordSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  generationId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  reasoning: z.string().optional(),
  createdAt: z.string(),
  meta: z.record(z.unknown()).optional()
});

export const VersionRecordSchema = z.object({
  versionId: z.string(),
  threadId: z.string(),
  baseVersionId: z.string().nullable(),
  specSnapshot: UISpecSchema,
  specHash: z.string(),
  mcpContextUsed: z.array(z.string()),
  createdAt: z.string()
});

export const GenerationLogRecordSchema = z.object({
  id: z.string(),
  generationId: z.string(),
  threadId: z.string(),
  warningCount: z.number(),
  patchCount: z.number(),
  durationMs: z.number(),
  errorCode: z.string().optional(),
  createdAt: z.string()
});

export const ThreadBundleSchema = z.object({
  thread: ThreadRecordSchema,
  messages: z.array(MessageRecordSchema),
  versions: z.array(VersionRecordSchema)
});
