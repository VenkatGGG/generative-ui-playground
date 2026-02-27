import { CreateThreadRequestSchema } from "@repo/contracts";
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

  const runtimeDeps = await getRuntimeDeps();
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
}
