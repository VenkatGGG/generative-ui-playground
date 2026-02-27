import { runtimeDeps } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ threadId: string }> }
): Promise<Response> {
  const { threadId } = await context.params;
  const bundle = await runtimeDeps.persistence.getThreadBundle(threadId);

  if (!bundle) {
    return Response.json(
      {
        error: "THREAD_NOT_FOUND",
        message: `Thread '${threadId}' was not found.`
      },
      { status: 404 }
    );
  }

  return Response.json(bundle);
}
