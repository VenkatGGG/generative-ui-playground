import { GenerateRequestV2Schema, type StreamEventV2 } from "@repo/contracts";
import { formatSseEventV2 } from "@repo/client-core";
import { runGenerationV2 } from "@repo/orchestrator";
import { handleGenerateRoute } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleGenerateRoute(request, {
    schema: GenerateRequestV2Schema,
    getThreadBundle: (deps, threadId) => deps.persistence.getThreadBundleV2(threadId),
    getBaseVersion: (deps, payload) =>
      deps.persistence.getVersionV2(payload.threadId, payload.baseVersionId),
    runGeneration: (payload, deps) => runGenerationV2(payload, deps),
    formatEvent: formatSseEventV2,
    buildErrorEvent: (message): StreamEventV2 => ({
      type: "error",
      generationId: "unknown",
      code: "GENERATION_EXCEPTION",
      message
    })
  });
}
