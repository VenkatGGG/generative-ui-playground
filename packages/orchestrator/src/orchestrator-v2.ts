import { createHash, randomUUID } from "node:crypto";
import {
  UITreeSnapshotV2Schema,
  type GenerateRequestV2,
  type StreamEventV2,
  type UITreeSnapshotV2,
  type UISpecV2
} from "@repo/contracts";
import { getAllowedComponentTypeSetV2 } from "@repo/component-catalog";
import { diffSpecs, normalizeTreeToSpecV2, validateSpecV2 } from "@repo/spec-engine";
import type { GenerationModelAdapter, MCPAdapter } from "@repo/integrations";
import type { PersistenceAdapter } from "@repo/persistence";
import { extractCompleteJsonObjects } from "./json-stream";

export interface OrchestratorDepsV2 {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapter;
}

function specHash(spec: UISpecV2): string {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

function tokenEstimate(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function parseCandidateSnapshotV2(input: string): UITreeSnapshotV2 | null {
  try {
    const parsed = JSON.parse(input) as unknown;
    const snapshotResult = UITreeSnapshotV2Schema.safeParse(parsed);
    if (snapshotResult.success) {
      return snapshotResult.data as UITreeSnapshotV2;
    }

    // Graceful compatibility: accept raw node snapshots and wrap into { tree }.
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { id?: unknown }).id === "string" &&
      typeof (parsed as { type?: unknown }).type === "string"
    ) {
      const wrapped = UITreeSnapshotV2Schema.safeParse({ tree: parsed });
      return wrapped.success ? (wrapped.data as UITreeSnapshotV2) : null;
    }

    return null;
  } catch {
    return null;
  }
}

function buildFallbackSnapshotV2(prompt: string): UITreeSnapshotV2 {
  const title = prompt.includes("pricing") ? "Pricing Card" : "Generated UI";
  const summary = prompt.trim().replace(/\s+/g, " ").slice(0, 120) || "Semantic v2 fallback snapshot.";

  return {
    state: {
      details: [
        { id: "d1", text: "Stable fallback output" },
        { id: "d2", text: "Valid v2 semantics" }
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
            {
              id: "title",
              type: "CardTitle",
              children: [title]
            },
            {
              id: "description",
              type: "CardDescription",
              children: [summary]
            }
          ]
        },
        {
          id: "content",
          type: "CardContent",
          children: [
            {
              id: "items",
              type: "Stack",
              repeat: { statePath: "/details", key: "id" },
              children: [
                {
                  id: "item-text",
                  type: "Text",
                  props: { text: { $item: "text" } },
                  children: []
                }
              ]
            },
            {
              id: "cta",
              type: "Button",
              children: ["Continue"]
            }
          ]
        }
      ]
    }
  };
}

async function recordFailureSafely(
  deps: OrchestratorDepsV2,
  request: GenerateRequestV2,
  generationId: string,
  warnings: Array<{ code: string; message: string }>,
  patchCount: number,
  startedAt: number,
  errorCode: string
): Promise<void> {
  try {
    await deps.persistence.recordGenerationFailure({
      threadId: request.threadId,
      generationId,
      warningCount: warnings.length,
      patchCount,
      durationMs: Math.max(0, Date.now() - startedAt),
      errorCode
    });
  } catch {
    // Failure logging must never break the generation stream.
  }
}

export async function* runGenerationV2(
  request: GenerateRequestV2,
  deps: OrchestratorDepsV2
): AsyncGenerator<StreamEventV2> {
  const generationId = randomUUID();
  const startedAt = Date.now();
  const warnings: Array<{ code: string; message: string }> = [];
  let patchCount = 0;
  let modelOutputText = "";

  try {
    const threadBundle = await deps.persistence.getThreadBundleV2(request.threadId);
    if (!threadBundle) {
      yield {
        type: "error",
        generationId,
        code: "THREAD_NOT_FOUND",
        message: `Thread '${request.threadId}' not found.`
      };
      return;
    }

    const baseVersion = await deps.persistence.getVersionV2(request.threadId, request.baseVersionId);
    if (request.baseVersionId && !baseVersion) {
      await recordFailureSafely(
        deps,
        request,
        generationId,
        warnings,
        patchCount,
        startedAt,
        "BASE_VERSION_CONFLICT"
      );
      yield {
        type: "error",
        generationId,
        code: "BASE_VERSION_CONFLICT",
        message: `Base version '${request.baseVersionId}' was not found for thread '${request.threadId}'.`
      };
      return;
    }

    let canonicalSpec: UISpecV2 =
      baseVersion?.specSnapshot ??
      ({
        root: "",
        elements: {}
      } satisfies UISpecV2);

    yield { type: "status", generationId, stage: "pass1_extract_components_v2" };
    const pass1 = await deps.model.extractComponents({
      prompt: request.prompt,
      previousSpec: baseVersion?.specSnapshot ?? null
    });

    yield { type: "status", generationId, stage: "mcp_fetch_context_v2" };
    const mcpContext = await deps.mcp.fetchContext(pass1.components);
    const allowedComponentTypes = getAllowedComponentTypeSetV2();

    yield { type: "status", generationId, stage: "pass2_stream_design_v2" };
    const streamSource =
      deps.model.streamDesignV2?.({
        prompt: request.prompt,
        previousSpec: baseVersion?.specSnapshot ?? null,
        componentContext: mcpContext
      }) ??
      deps.model.streamDesign({
        prompt: request.prompt,
        previousSpec: baseVersion?.specSnapshot ?? null,
        componentContext: mcpContext
      });

    let acceptedCandidate = false;
    let buffer = "";
    for await (const chunk of streamSource) {
      modelOutputText += chunk;
      buffer += chunk;
      const extracted = extractCompleteJsonObjects(buffer);
      buffer = extracted.remainder;

      for (const objectText of extracted.objects) {
        const snapshot = parseCandidateSnapshotV2(objectText);
        if (!snapshot) {
          continue;
        }

        const candidateSpec = normalizeTreeToSpecV2(snapshot);
        const validation = validateSpecV2(candidateSpec, { allowedComponentTypes });
        if (!validation.valid) {
          for (const issue of validation.issues) {
            const warning = {
              type: "warning" as const,
              generationId,
              code: issue.code,
              message: issue.message
            };
            warnings.push({ code: warning.code, message: warning.message });
            yield warning;
          }
          continue;
        }

        const patches = diffSpecs(canonicalSpec, candidateSpec);
        for (const patch of patches) {
          patchCount += 1;
          yield {
            type: "patch",
            generationId,
            patch
          };
        }

        canonicalSpec = candidateSpec;
        acceptedCandidate = true;
      }
    }

    if (!acceptedCandidate) {
      const fallbackSnapshot = buildFallbackSnapshotV2(request.prompt);
      const fallbackSpec = normalizeTreeToSpecV2(fallbackSnapshot);
      const validation = validateSpecV2(fallbackSpec, { allowedComponentTypes });

      if (!validation.valid) {
        await recordFailureSafely(
          deps,
          request,
          generationId,
          warnings,
          patchCount,
          startedAt,
          "V2_FALLBACK_INVALID"
        );
        yield {
          type: "error",
          generationId,
          code: "V2_FALLBACK_INVALID",
          message: "Fallback spec failed semantic validation."
        };
        return;
      }

      const fallbackWarning = {
        type: "warning" as const,
        generationId,
        code: "FALLBACK_APPLIED",
        message: "Applied deterministic v2 fallback UI."
      };
      warnings.push({ code: fallbackWarning.code, message: fallbackWarning.message });
      yield fallbackWarning;

      const patches = diffSpecs(canonicalSpec, fallbackSpec);
      for (const patch of patches) {
        patchCount += 1;
        yield {
          type: "patch",
          generationId,
          patch
        };
      }
      canonicalSpec = fallbackSpec;
      acceptedCandidate = true;
    }

    if (!acceptedCandidate) {
      await recordFailureSafely(
        deps,
        request,
        generationId,
        warnings,
        patchCount,
        startedAt,
        "NO_VALID_CANDIDATE_V2"
      );
      yield {
        type: "error",
        generationId,
        code: "NO_VALID_CANDIDATE_V2",
        message: "No valid semantic v2 snapshot was produced."
      };
      return;
    }

    const hash = specHash(canonicalSpec);
    const assistantResponseText = modelOutputText.trim() || JSON.stringify(canonicalSpec);
    const assistantReasoningText = [
      `Generated semantic v2 UI for prompt "${request.prompt.slice(0, 120)}".`,
      `Intent confidence: ${pass1.confidence.toFixed(2)}.`,
      `MCP context ${mcpContext.contextVersion} supplied ${mcpContext.componentRules.length} rule(s).`,
      `Applied ${patchCount} patch(es); warnings: ${warnings.length}.`
    ].join(" ");

    const persisted = await deps.persistence.persistGenerationV2({
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
      durationMs: Math.max(0, Date.now() - startedAt)
    });

    const promptTokens = tokenEstimate(request.prompt);
    const completionTokens = tokenEstimate(modelOutputText);
    yield {
      type: "usage",
      generationId,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };

    yield {
      type: "done",
      generationId,
      versionId: persisted.version.versionId,
      specHash: hash
    };
  } catch (error) {
    await recordFailureSafely(
      deps,
      request,
      generationId,
      warnings,
      patchCount,
      startedAt,
      "GENERATION_EXCEPTION"
    );
    yield {
      type: "error",
      generationId,
      code: "GENERATION_EXCEPTION",
      message: error instanceof Error ? error.message : "Unknown generation error."
    };
  }
}
