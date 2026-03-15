import { handleGetThreadBundleRoute } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ threadId: string }> }
): Promise<Response> {
  const { threadId } = await context.params;
  return handleGetThreadBundleRoute(request, threadId, {
    getThreadBundle: (deps, id) => deps.persistence.getThreadBundle(id)
  });
}
