import { z } from "zod";
import type { StreamEventV2 } from "./types-v2";
import { JsonPatchSchema, MessageRecordSchema, ThreadRecordSchema } from "./schemas";

const VISIBILITY_COMPARATOR_SHAPE = {
  eq: z.unknown().optional(),
  neq: z.unknown().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  not: z.boolean().optional()
} as const;

function withComparatorValidation<T extends z.AnyZodObject>(schema: T): z.ZodEffects<T> {
  return schema.superRefine((value, ctx) => {
    const comparatorKeys = ["eq", "neq", "gt", "gte", "lt", "lte"] as const;
    const presentComparators = comparatorKeys.filter(
      (key) => (value as Record<string, unknown>)[key] !== undefined
    );
    if (presentComparators.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one comparator key is allowed in a visibility expression."
      });
    }
  });
}

const VisibilityStateConditionSchema = withComparatorValidation(
  z
    .object({
      $state: z.string().min(1),
      ...VISIBILITY_COMPARATOR_SHAPE
    })
    .strict()
);

const VisibilityItemConditionSchema = withComparatorValidation(
  z
    .object({
      $item: z.string().min(1),
      ...VISIBILITY_COMPARATOR_SHAPE
    })
    .strict()
);

const VisibilityIndexConditionSchema = withComparatorValidation(
  z
  .object({
    $index: z.literal(true),
    ...VISIBILITY_COMPARATOR_SHAPE
  })
  .strict()
);

export const VisibilityConditionV2Schema: z.ZodType = z.lazy(() =>
  z.union([
    z.boolean(),
    VisibilityStateConditionSchema,
    VisibilityItemConditionSchema,
    VisibilityIndexConditionSchema,
    z.object({ $and: z.array(VisibilityConditionV2Schema).min(1) }).strict(),
    z.object({ $or: z.array(VisibilityConditionV2Schema).min(1) }).strict(),
    z.array(VisibilityConditionV2Schema).min(1)
  ])
);

export const DynamicValueExprV2Schema: z.ZodType = z.lazy(() =>
  z.union([
    z.object({ $state: z.string().min(1), default: z.unknown().optional() }).strict(),
    z.object({ $item: z.string().min(1), default: z.unknown().optional() }).strict(),
    z.object({ $index: z.literal(true) }).strict(),
    z.object({ $bindState: z.string().min(1) }).strict(),
    z.object({ $bindItem: z.string().min(1) }).strict(),
    z
      .object({
        $cond: z.union([VisibilityConditionV2Schema, DynamicValueExprV2Schema]),
        $then: z.unknown(),
        $else: z.unknown()
      })
      .strict()
  ])
);

export const RepeatConfigV2Schema = z
  .object({
    statePath: z.string().min(1),
    key: z.string().min(1).optional()
  })
  .strict();

export const ActionBindingV2Schema = z
  .object({
    action: z.enum(["setState", "pushState", "removeState", "validateForm"]),
    params: z.record(z.unknown()).optional()
  })
  .strict();

const ActionBindingRecordV2Schema = z.record(
  z.union([ActionBindingV2Schema, z.array(ActionBindingV2Schema).min(1)])
);

export const UIComponentNodeV2Schema: z.ZodType<{
  id: string;
  type: string;
  props?: Record<string, unknown>;
  slots?: Record<string, string[]>;
  visible?: unknown;
  repeat?: unknown;
  on?: Record<string, unknown>;
  watch?: Record<string, unknown>;
  children?: Array<unknown>;
}> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.string().min(1),
      props: z.record(z.unknown()).optional(),
      slots: z.record(z.array(z.string())).optional(),
      visible: VisibilityConditionV2Schema.optional(),
      repeat: RepeatConfigV2Schema.optional(),
      on: ActionBindingRecordV2Schema.optional(),
      watch: ActionBindingRecordV2Schema.optional(),
      children: z.array(z.union([z.string(), UIComponentNodeV2Schema])).optional()
    })
    .strict()
);

export const UISpecElementV2Schema = z
  .object({
    type: z.string().min(1),
    props: z.record(z.unknown()),
    children: z.array(z.string()),
    slots: z.record(z.array(z.string())).optional(),
    visible: VisibilityConditionV2Schema.optional(),
    repeat: RepeatConfigV2Schema.optional(),
    on: ActionBindingRecordV2Schema.optional(),
    watch: ActionBindingRecordV2Schema.optional()
  })
  .strict();

export const UISpecV2Schema = z
  .object({
    root: z.string(),
    elements: z.record(UISpecElementV2Schema),
    state: z.record(z.unknown()).optional()
  })
  .strict();

export const UITreeSnapshotV2Schema = z
  .object({
    state: z.record(z.unknown()).optional(),
    tree: UIComponentNodeV2Schema
  })
  .strict();

export const GenerateRequestV2Schema = z
  .object({
    threadId: z.string().min(1),
    prompt: z.string().min(1),
    baseVersionId: z.string().nullable()
  })
  .strict();

export const StreamEventV2Schema: z.ZodType<StreamEventV2> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), generationId: z.string(), stage: z.string() }).strict(),
  z.object({ type: z.literal("patch"), generationId: z.string(), patch: JsonPatchSchema }).strict(),
  z
    .object({
      type: z.literal("warning"),
      generationId: z.string(),
      code: z.string(),
      message: z.string()
    })
    .strict(),
  z
    .object({
      type: z.literal("usage"),
      generationId: z.string(),
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
      model: z.string().optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("done"),
      generationId: z.string(),
      versionId: z.string(),
      specHash: z.string()
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      generationId: z.string(),
      code: z.string(),
      message: z.string()
    })
    .strict()
]);

export const VersionRecordV2Schema = z
  .object({
    versionId: z.string(),
    threadId: z.string(),
    baseVersionId: z.string().nullable(),
    specSnapshot: UISpecV2Schema,
    specHash: z.string(),
    mcpContextUsed: z.array(z.string()),
    schemaVersion: z.literal("v2"),
    createdAt: z.string()
  })
  .strict();

export const ThreadBundleV2Schema = z
  .object({
    thread: ThreadRecordSchema,
    messages: z.array(MessageRecordSchema),
    versions: z.array(VersionRecordV2Schema)
  })
  .strict();
