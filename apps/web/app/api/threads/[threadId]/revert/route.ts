import { RevertRequestSchema } from "@repo/contracts";
import { handleRevertThreadRoute } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> }
): Promise<Response> {
  const { threadId } = await context.params;
  return handleRevertThreadRoute(request, threadId, {
    schema: RevertRequestSchema,
    getThreadBundle: (deps, id) => deps.persistence.getThreadBundle(id),
    revertThread: (deps, id, payload) => deps.persistence.revertThread(id, payload.versionId)
  });
}
