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

export async function* runGeneration(
  request: GenerateRequest,
  deps: OrchestratorDeps
): AsyncGenerator<StreamEvent> {
  const generationId = randomUUID();
  const warnings: Array<{ code: string; message: string }> = [];

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
      const validation = validateSpec(candidateSpec, {
        allowedComponentTypes: new Set([
          ...pass1.components,
          "Text",
          "Card",
          "CardHeader",
          "CardTitle",
          "CardDescription",
          "CardContent",
          "Button"
        ])
      });

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
        yield {
          type: "patch",
          generationId,
          patch
        };
      }

      canonicalSpec = candidateSpec;
    }
  }

  if (buffer.trim()) {
    const candidateNode = parseCandidateLine(buffer);
    if (candidateNode) {
      const candidateSpec = normalizeTreeToSpec(candidateNode);
      const validation = validateSpec(candidateSpec);
      if (validation.valid) {
        const patches = diffSpecs(canonicalSpec, candidateSpec);
        for (const patch of patches) {
          yield {
            type: "patch",
            generationId,
            patch
          };
        }
        canonicalSpec = candidateSpec;
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
    warnings
  });

  yield {
    type: "done",
    generationId,
    versionId: persisted.version.versionId,
    specHash: hash
  };
}
