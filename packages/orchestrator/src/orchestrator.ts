import { createHash, randomUUID } from "node:crypto";
import {
  UIComponentNodeSchema,
  type GenerateRequest,
  type StreamEvent,
  type UIComponentNode,
  type UISpec
} from "@repo/contracts";
import { normalizeTreeToSpec, validateSpec, diffSpecs } from "@repo/spec-engine";
import type { GenerationModelAdapter, MCPAdapter } from "@repo/integrations";
import type { PersistenceAdapter } from "@repo/persistence";
import { extractCompleteJsonObjects } from "./json-stream";

export interface OrchestratorDeps {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapter;
}

function specHash(spec: UISpec): string {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

function parseCandidateObject(input: string): UIComponentNode | null {
  try {
    const parsed = JSON.parse(input);
    const validated = UIComponentNodeSchema.safeParse(parsed);
    if (!validated.success) {
      return null;
    }

    return validated.data as UIComponentNode;
  } catch {
    return null;
  }
}

const fatalValidationCodes = new Set(["MAX_DEPTH_EXCEEDED", "MAX_NODES_EXCEEDED"]);

function summarizePrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 120) {
    return trimmed;
  }

  return `${trimmed.slice(0, 117)}...`;
}

function buildAssistantReasoningText(input: {
  prompt: string;
  intentType: "new" | "modify";
  confidence: number;
  componentNames: string[];
  mcpContextVersion: string;
  mcpRuleCount: number;
  patchCount: number;
  warningCount: number;
  finalElementCount: number;
}): string {
  const action = input.intentType === "modify" ? "Refined an existing UI" : "Generated a new UI";
  const components =
    input.componentNames.length > 0 ? input.componentNames.join(", ") : "none explicitly requested";
  const warnings =
    input.warningCount === 0
      ? "Validation completed with no warnings."
      : `Validation raised ${input.warningCount} warning(s).`;

  return [
    `${action} from prompt "${summarizePrompt(input.prompt)}".`,
    `Intent confidence: ${input.confidence.toFixed(2)}.`,
    `Target components: ${components}.`,
    `MCP context ${input.mcpContextVersion} supplied ${input.mcpRuleCount} rule(s).`,
    `Applied ${input.patchCount} patch(es); final spec has ${input.finalElementCount} element(s).`,
    warnings
  ].join(" ");
}

export async function* runGeneration(
  request: GenerateRequest,
  deps: OrchestratorDeps
): AsyncGenerator<StreamEvent> {
  const generationId = randomUUID();
  const startedAt = Date.now();
  const warnings: Array<{ code: string; message: string }> = [];
  let patchCount = 0;
  let modelOutputText = "";
  const getDurationMs = (): number => Math.max(0, Date.now() - startedAt);
  const appendModelOutput = (chunk: string): void => {
    if (chunk.length === 0 || modelOutputText.length >= 20_000) {
      return;
    }

    const remaining = 20_000 - modelOutputText.length;
    modelOutputText += chunk.slice(0, remaining);
  };
  const recordFailure = async (errorCode: string): Promise<void> => {
    try {
      await deps.persistence.recordGenerationFailure({
        threadId: request.threadId,
        generationId,
        warningCount: warnings.length,
        patchCount,
        durationMs: getDurationMs(),
        errorCode
      });
    } catch {
      // Failure logging must never break the generation stream.
    }
  };

  try {
    const threadBundle = await deps.persistence.getThreadBundle(request.threadId);
    if (!threadBundle) {
      yield {
        type: "error",
        generationId,
        code: "THREAD_NOT_FOUND",
        message: `Thread '${request.threadId}' not found.`
      };
      return;
    }

    const baseVersion = await deps.persistence.getVersion(request.threadId, request.baseVersionId);
    if (request.baseVersionId && !baseVersion) {
      await recordFailure("BASE_VERSION_CONFLICT");
      yield {
        type: "error",
        generationId,
        code: "BASE_VERSION_CONFLICT",
        message: `Base version '${request.baseVersionId}' was not found for thread '${request.threadId}'.`
      };
      return;
    }

    let canonicalSpec: UISpec =
      baseVersion?.specSnapshot ??
      ({
        root: "",
        elements: {}
      } satisfies UISpec);

    yield { type: "status", generationId, stage: "pass1_extract_components" };
    const pass1 = await deps.model.extractComponents({
      prompt: request.prompt,
      previousSpec: baseVersion?.specSnapshot ?? null
    });

    yield { type: "status", generationId, stage: "mcp_fetch_context" };
    const mcpContext = await deps.mcp.fetchContext(pass1.components);

    yield { type: "status", generationId, stage: "pass2_stream_design" };

    const allowedComponentTypes = new Set([
      ...pass1.components,
      "Text",
      "Card",
      "CardHeader",
      "CardTitle",
      "CardDescription",
      "CardContent",
      "Button"
    ]);

    const validateAndDiffCandidate = (
      candidateSpec: UISpec
    ):
      | { type: "valid"; patches: ReturnType<typeof diffSpecs>; nextSpec: UISpec }
      | {
          type: "invalid";
          warnings: Array<{ code: string; message: string }>;
          fatalError: { code: string; message: string } | null;
        } => {
      const validation = validateSpec(candidateSpec, { allowedComponentTypes });

      if (!validation.valid) {
        const nextWarnings = validation.issues.map((issue) => ({
          code: issue.code,
          message: issue.message
        }));
        const fatalIssue = validation.issues.find((issue) => fatalValidationCodes.has(issue.code));

        return {
          type: "invalid",
          warnings: nextWarnings,
          fatalError: fatalIssue
            ? {
                code: fatalIssue.code,
                message: fatalIssue.message
              }
            : null
        };
      }

      return {
        type: "valid",
        patches: diffSpecs(canonicalSpec, candidateSpec),
        nextSpec: candidateSpec
      };
    };

    let buffer = "";

    function* processCandidateNode(
      candidateNode: UIComponentNode
    ): Generator<StreamEvent, "continue" | string, void> {
      const candidateSpec = normalizeTreeToSpec(candidateNode);
      const result = validateAndDiffCandidate(candidateSpec);

      if (result.type === "invalid") {
        for (const issue of result.warnings) {
          const warning = {
            type: "warning" as const,
            generationId,
            code: issue.code,
            message: issue.message
          };
          warnings.push({ code: warning.code, message: warning.message });
          yield warning;
        }

        if (result.fatalError) {
          yield {
            type: "error",
            generationId,
            code: result.fatalError.code,
            message: result.fatalError.message
          };
          return result.fatalError.code;
        }

        return "continue";
      }

      for (const patch of result.patches) {
        patchCount += 1;
        yield {
          type: "patch",
          generationId,
          patch
        };
      }

      canonicalSpec = result.nextSpec;
      return "continue";
    }

    for await (const chunk of deps.model.streamDesign({
      prompt: request.prompt,
      previousSpec: baseVersion?.specSnapshot ?? null,
      componentContext: mcpContext
    })) {
      appendModelOutput(chunk);
      buffer += chunk;
      const extracted = extractCompleteJsonObjects(buffer);
      buffer = extracted.remainder;

      for (const jsonObject of extracted.objects) {
        const candidateNode = parseCandidateObject(jsonObject);
        if (!candidateNode) {
          continue;
        }

        const outcome = yield* processCandidateNode(candidateNode);
        if (outcome !== "continue") {
          await recordFailure(outcome);
          return;
        }
      }
    }

    if (buffer.trim()) {
      const extracted = extractCompleteJsonObjects(buffer);
      for (const jsonObject of extracted.objects) {
        const candidateNode = parseCandidateObject(jsonObject);
        if (!candidateNode) {
          continue;
        }

        const outcome = yield* processCandidateNode(candidateNode);
        if (outcome !== "continue") {
          await recordFailure(outcome);
          return;
        }
      }
    }

    const hash = specHash(canonicalSpec);
    const assistantResponseText = modelOutputText.trim() || JSON.stringify(canonicalSpec);
    const assistantReasoningText = buildAssistantReasoningText({
      prompt: request.prompt,
      intentType: pass1.intentType,
      confidence: pass1.confidence,
      componentNames: pass1.components,
      mcpContextVersion: mcpContext.contextVersion,
      mcpRuleCount: mcpContext.componentRules.length,
      patchCount,
      warningCount: warnings.length,
      finalElementCount: Object.keys(canonicalSpec.elements).length
    });
    const persisted = await deps.persistence.persistGeneration({
      threadId: request.threadId,
      generationId,
      prompt: request.prompt,
      assistantResponseText,
      assistantReasoningText,
      baseVersionId: request.baseVersionId,
      specSnapshot: canonicalSpec,
      specHash: hash,
      mcpContextUsed: pass1.components,
      warnings,
      patchCount,
      durationMs: getDurationMs()
    });

    yield {
      type: "done",
      generationId,
      versionId: persisted.version.versionId,
      specHash: hash
    };
  } catch (error) {
    await recordFailure("GENERATION_EXCEPTION");
    yield {
      type: "error",
      generationId,
      code: "GENERATION_EXCEPTION",
      message: error instanceof Error ? error.message : "Unknown generation error."
    };
  }
}
