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
import {
  buildConstraintSet,
  canonicalizeNodeTypes,
  validateConstraintSet,
  type ConstraintViolation
} from "./constraints";

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

    return canonicalizeNodeTypes(validated.data as UIComponentNode);
  } catch {
    return null;
  }
}

const fatalValidationCodes = new Set(["MAX_DEPTH_EXCEEDED", "MAX_NODES_EXCEEDED"]);
const MAX_PASS2_ATTEMPTS = 3;

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

function buildRetryPrompt(basePrompt: string, violations: ConstraintViolation[], attempt: number): string {
  if (violations.length === 0) {
    return basePrompt;
  }

  const lines = violations.map((violation) => `- ${violation.message}`);

  return [
    basePrompt,
    "",
    `Retry attempt ${attempt}. You must satisfy ALL requirements below:`,
    ...lines,
    "Return complete UIComponentNode JSON snapshots only."
  ].join("\n");
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

    const constraints = buildConstraintSet({
      prompt: request.prompt,
      pass1,
      mcpContext
    });
    const allowedComponentTypes = constraints.allowedComponentTypes;

    const validateAndDiffCandidate = (
      candidateSpec: UISpec
    ):
      | { type: "valid"; patches: ReturnType<typeof diffSpecs>; nextSpec: UISpec }
      | {
          type: "invalid";
          violations: ConstraintViolation[];
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
          violations: [],
          warnings: nextWarnings,
          fatalError: fatalIssue
            ? {
                code: fatalIssue.code,
                message: fatalIssue.message
              }
            : null
        };
      }

      const constraintViolations = validateConstraintSet(candidateSpec, constraints);
      if (constraintViolations.length > 0) {
        return {
          type: "invalid",
          violations: constraintViolations,
          warnings: constraintViolations.map((violation) => ({
            code: violation.code,
            message: violation.message
          })),
          fatalError: null
        };
      }

      return {
        type: "valid",
        patches: diffSpecs(canonicalSpec, candidateSpec),
        nextSpec: candidateSpec
      };
    };

    function* processCandidateNode(
      candidateNode: UIComponentNode
    ): Generator<StreamEvent, "accepted" | "rejected" | string, void> {
      const candidateSpec = normalizeTreeToSpec(candidateNode);
      const result = validateAndDiffCandidate(candidateSpec);

      if (result.type === "invalid") {
        if (result.violations.length > 0) {
          lastConstraintViolations = result.violations;
        }
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

        return "rejected";
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
      return "accepted";
    }

    let acceptedCandidate = false;
    let sawAnyCandidate = false;
    let lastConstraintViolations: ConstraintViolation[] = [];

    for (let attempt = 1; attempt <= MAX_PASS2_ATTEMPTS; attempt += 1) {
      yield {
        type: "status",
        generationId,
        stage: attempt === 1 ? "pass2_stream_design" : `pass2_stream_design_retry_${attempt}`
      };

      let buffer = "";
      const streamPrompt =
        attempt === 1
          ? request.prompt
          : buildRetryPrompt(request.prompt, lastConstraintViolations, attempt);

      for await (const chunk of deps.model.streamDesign({
        prompt: streamPrompt,
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

          sawAnyCandidate = true;
          const outcome = yield* processCandidateNode(candidateNode);
          if (outcome === "accepted") {
            acceptedCandidate = true;
            continue;
          }

          if (outcome !== "rejected") {
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

          sawAnyCandidate = true;
          const outcome = yield* processCandidateNode(candidateNode);
          if (outcome === "accepted") {
            acceptedCandidate = true;
            continue;
          }

          if (outcome !== "rejected") {
            await recordFailure(outcome);
            return;
          }
        }
      }

      const finalViolations = validateConstraintSet(canonicalSpec, constraints);
      if (finalViolations.length === 0 && (pass1.intentType !== "new" || patchCount > 0)) {
        acceptedCandidate = true;
        lastConstraintViolations = [];
        break;
      }

      lastConstraintViolations = finalViolations;
      if (attempt < MAX_PASS2_ATTEMPTS) {
        const retryWarning = {
          type: "warning" as const,
          generationId,
          code: "CONSTRAINT_RETRY",
          message: `Retrying generation to satisfy constraints (attempt ${attempt + 1}/${MAX_PASS2_ATTEMPTS}).`
        };
        warnings.push({ code: retryWarning.code, message: retryWarning.message });
        yield retryWarning;
      }
    }

    if (!acceptedCandidate || (pass1.intentType === "new" && patchCount === 0)) {
      const reason =
        !sawAnyCandidate || lastConstraintViolations.length === 0
          ? "Model did not produce a valid non-empty constrained candidate."
          : lastConstraintViolations.map((violation) => violation.message).join(" ");

      await recordFailure("MCP_CONSTRAINT_NOT_SATISFIED");
      yield {
        type: "error",
        generationId,
        code: "MCP_CONSTRAINT_NOT_SATISFIED",
        message: reason
      };
      return;
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
