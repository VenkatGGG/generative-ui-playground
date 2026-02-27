import { createHash, randomUUID } from "node:crypto";
import type { GenerateRequest, StreamEvent, UIComponentNode, UISpec } from "@repo/contracts";
import { normalizeTreeToSpec, validateSpec, diffSpecs } from "@repo/spec-engine";
import type { GenerationModelAdapter, MCPAdapter } from "@repo/integrations";
import type { PersistenceAdapter } from "@repo/persistence";

export interface OrchestratorDeps {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapter;
}

function specHash(spec: UISpec): string {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

function parseCandidateLine(line: string): UIComponentNode | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as UIComponentNode;
  } catch {
    return null;
  }
}

const fatalValidationCodes = new Set(["MAX_DEPTH_EXCEEDED", "MAX_NODES_EXCEEDED"]);

export async function* runGeneration(
  request: GenerateRequest,
  deps: OrchestratorDeps
): AsyncGenerator<StreamEvent> {
  const generationId = randomUUID();
  const warnings: Array<{ code: string; message: string }> = [];
  let patchCount = 0;

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

  for await (const chunk of deps.model.streamDesign({
    prompt: request.prompt,
    previousSpec: baseVersion?.specSnapshot ?? null,
    componentContext: mcpContext
  })) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const candidateNode = parseCandidateLine(line);
      if (!candidateNode) {
        continue;
      }

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
          return;
        }

        continue;
      }

      const patches = result.patches;
      for (const patch of patches) {
        patchCount += 1;
        yield {
          type: "patch",
          generationId,
          patch
        };
      }

      canonicalSpec = result.nextSpec;
    }
  }

  if (buffer.trim()) {
    const candidateNode = parseCandidateLine(buffer);
    if (candidateNode) {
      const candidateSpec = normalizeTreeToSpec(candidateNode);
      const result = validateAndDiffCandidate(candidateSpec);
      if (result.type === "valid") {
        for (const patch of result.patches) {
          patchCount += 1;
          yield { type: "patch", generationId, patch };
        }
        canonicalSpec = result.nextSpec;
      } else {
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
          return;
        }
      }
    }
  }

  const hash = specHash(canonicalSpec);
  const persisted = await deps.persistence.persistGeneration({
    threadId: request.threadId,
    generationId,
    prompt: request.prompt,
    baseVersionId: request.baseVersionId,
    specSnapshot: canonicalSpec,
    specHash: hash,
    mcpContextUsed: pass1.components,
    warnings,
    patchCount
  });

  yield {
    type: "done",
    generationId,
    versionId: persisted.version.versionId,
    specHash: hash
  };
}
