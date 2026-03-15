import { CreateThreadRequestSchema } from "@repo/contracts";
import { handleCreateThreadRoute } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleCreateThreadRoute(request, {
    schema: CreateThreadRequestSchema,
    createThread: (deps, input) => deps.persistence.createThread(input),
    getThreadBundle: (deps, threadId) => deps.persistence.getThreadBundle(threadId)
  });
}
