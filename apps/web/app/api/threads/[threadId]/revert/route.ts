import { RevertRequestSchema } from "@repo/contracts";
import { getRuntimeDeps } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> }
): Promise<Response> {
  const { threadId } = await context.params;
  const runtimeDeps = await getRuntimeDeps();
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
    return Response.json(
      {
        error: "REVERT_FAILED",
        message
      },
      { status: 404 }
    );
  }
}
