import { CreateThreadRequestSchema } from "@repo/contracts";
import type { OrchestratorDeps } from "@repo/orchestrator";
import { getOrCreateRuntimeDeps } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      {
        error: "INVALID_REQUEST",
        issues: [
          {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
            path: []
          }
        ]
      },
      { status: 400 }
    );
  }
  const parsed = CreateThreadRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "INVALID_REQUEST",
        issues: parsed.error.issues
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  let runtimeDeps: OrchestratorDeps;
  try {
    runtimeDeps = await getOrCreateRuntimeDeps();
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
    const thread = await runtimeDeps.persistence.createThread(parsed.data);
    const bundle = await runtimeDeps.persistence.getThreadBundle(thread.threadId);

    return Response.json(
      {
        thread,
        versions: bundle?.versions ?? [],
        messages: bundle?.messages ?? []
      },
      {
        status: 201
      }
    );
  } catch (error) {
    return Response.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Thread creation failed."
      },
      { status: 500 }
    );
  }
}
