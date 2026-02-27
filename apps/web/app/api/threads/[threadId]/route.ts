import type { OrchestratorDeps } from "@repo/orchestrator";
import { getRuntimeDeps } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ threadId: string }> }
): Promise<Response> {
  const { threadId } = await context.params;
  let runtimeDeps: OrchestratorDeps;
  try {
    runtimeDeps = await getRuntimeDeps();
  } catch (error) {
    return Response.json(
      {
        error: "RUNTIME_DEPENDENCY_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to initialize runtime dependencies."
      },
      { status: 500 }
    );
  }

  try {
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
  } catch (error) {
    return Response.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Thread retrieval failed."
      },
      { status: 500 }
    );
  }
}
