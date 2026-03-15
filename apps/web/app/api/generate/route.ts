import { GenerateRequestSchema, type StreamEvent } from "@repo/contracts";
import { formatSseEvent } from "@repo/client-core";
import { runGeneration } from "@repo/orchestrator";
import { handleGenerateRoute } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleGenerateRoute(request, {
    schema: GenerateRequestSchema,
    getThreadBundle: (deps, threadId) => deps.persistence.getThreadBundle(threadId),
    getBaseVersion: (deps, payload) =>
      deps.persistence.getVersion(payload.threadId, payload.baseVersionId),
    runGeneration: (payload, deps) => runGeneration(payload, deps),
    formatEvent: formatSseEvent,
    buildErrorEvent: (message): StreamEvent => ({
      type: "error",
      generationId: "unknown",
      code: "GENERATION_EXCEPTION",
      message
    })
  });
}
