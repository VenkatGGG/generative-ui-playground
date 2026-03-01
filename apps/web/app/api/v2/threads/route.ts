import { CreateThreadRequestSchema } from "@repo/contracts";
import type { OrchestratorDepsV2 } from "@repo/orchestrator";
import { getRuntimeDeps } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => ({}));
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

  let runtimeDeps: OrchestratorDepsV2;
  try {
    runtimeDeps = (await getRuntimeDeps()) as OrchestratorDepsV2;
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
    const thread = await runtimeDeps.persistence.createThreadV2(parsed.data);
    const bundle = await runtimeDeps.persistence.getThreadBundleV2(thread.threadId);

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
