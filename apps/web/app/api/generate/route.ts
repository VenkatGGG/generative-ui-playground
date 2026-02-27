import { GenerateRequestSchema } from "@repo/contracts";
import { formatSseEvent } from "@repo/client-core";
import { runGeneration } from "@repo/orchestrator";
import { runtimeDeps } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null);
  const parsed = GenerateRequestSchema.safeParse(payload);

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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of runGeneration(parsed.data, runtimeDeps)) {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown server error";
        controller.enqueue(
          encoder.encode(
            formatSseEvent({
              type: "error",
              generationId: "unknown",
              code: "GENERATION_EXCEPTION",
              message
            })
          )
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
