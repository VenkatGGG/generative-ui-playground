import { RevertRequestSchema } from "@repo/contracts";
import type { OrchestratorDeps } from "@repo/orchestrator";
import { getRuntimeDeps } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
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

  const payload = await request.json().catch(() => ({}));
  const parsed = RevertRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "INVALID_REQUEST",
        issues: parsed.error.issues
      },
      { status: 400 }
    );
  }

  try {
    const version = await runtimeDeps.persistence.revertThread(threadId, parsed.data.versionId);
    return Response.json({ version }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not revert thread";
    const isNotFound = /not found/i.test(message);
    if (isNotFound) {
      return Response.json(
        {
          error: "REVERT_FAILED",
          message
        },
        { status: 404 }
      );
    }

    return Response.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message
      },
      { status: 500 }
    );
  }
}
