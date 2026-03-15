import { getOrCreateRuntimeDeps } from "@/lib/server/runtime";
import { isPersistenceNotFoundError, type CreateThreadInput } from "@repo/persistence";
import type { RuntimeDeps } from "@repo/orchestrator";

type SafeParseSuccess<T> = { success: true; data: T };
type SafeParseFailure = { success: false; error: { issues: unknown } };
type SafeParseSchema<T> = { safeParse(input: unknown): SafeParseSuccess<T> | SafeParseFailure };

function invalidRequestResponse(issues: unknown): Response {
  return Response.json(
    {
      error: "INVALID_REQUEST",
      issues
    },
    { status: 400 }
  );
}

function invalidJsonResponse(): Response {
  return invalidRequestResponse([
    {
      code: "invalid_json",
      message: "Request body must be valid JSON.",
      path: []
    }
  ]);
}

function runtimeDependencyErrorResponse(error: unknown): Response {
  return Response.json(
    {
      error: "RUNTIME_DEPENDENCY_ERROR",
      message:
        error instanceof Error ? error.message : "Failed to initialize runtime dependencies."
    },
    { status: 500 }
  );
}

function internalServerErrorResponse(message: string): Response {
  return Response.json(
    {
      error: "INTERNAL_SERVER_ERROR",
      message
    },
    { status: 500 }
  );
}

async function resolveRuntimeDeps(): Promise<{ ok: true; deps: RuntimeDeps } | { ok: false; response: Response }> {
  try {
    return {
      ok: true,
      deps: await getOrCreateRuntimeDeps()
    };
  } catch (error) {
    return {
      ok: false,
      response: runtimeDependencyErrorResponse(error)
    };
  }
}

async function parseRequestWithSchema<T>(
  request: Request,
  schema: SafeParseSchema<T>,
  options: { rejectMalformedJson: boolean }
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    if (options.rejectMalformedJson) {
      return {
        ok: false,
        response: invalidJsonResponse()
      };
    }
    payload = null;
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      response: invalidRequestResponse(parsed.error.issues)
    };
  }

  return {
    ok: true,
    data: parsed.data
  };
}

function createSseResponse<TEvent>(
  streamEvents: AsyncIterable<TEvent>,
  formatEvent: (event: TEvent) => string,
  buildErrorEvent: (message: string) => TEvent
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of streamEvents) {
          controller.enqueue(encoder.encode(formatEvent(event)));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown server error";
        controller.enqueue(encoder.encode(formatEvent(buildErrorEvent(message))));
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

export async function handleCreateThreadRoute<
  TThread extends { threadId: string },
  TBundle extends { versions: unknown[]; messages: unknown[] }
>(
  request: Request,
  config: {
    schema: SafeParseSchema<CreateThreadInput>;
    createThread: (deps: RuntimeDeps, input: CreateThreadInput) => Promise<TThread>;
    getThreadBundle: (deps: RuntimeDeps, threadId: string) => Promise<TBundle | null>;
  }
): Promise<Response> {
  const parsed = await parseRequestWithSchema(request, config.schema, { rejectMalformedJson: true });
  if (!parsed.ok) {
    return parsed.response;
  }

  const runtime = await resolveRuntimeDeps();
  if (!runtime.ok) {
    return runtime.response;
  }

  try {
    const thread = await config.createThread(runtime.deps, parsed.data);
    const bundle = await config.getThreadBundle(runtime.deps, thread.threadId);

    return Response.json(
      {
        thread,
        versions: bundle?.versions ?? [],
        messages: bundle?.messages ?? []
      },
      { status: 201 }
    );
  } catch (error) {
    return internalServerErrorResponse(
      error instanceof Error ? error.message : "Thread creation failed."
    );
  }
}

export async function handleGetThreadBundleRoute<TBundle>(
  threadId: string,
  config: {
    getThreadBundle: (deps: RuntimeDeps, threadId: string) => Promise<TBundle | null>;
  }
): Promise<Response> {
  const runtime = await resolveRuntimeDeps();
  if (!runtime.ok) {
    return runtime.response;
  }

  try {
    const bundle = await config.getThreadBundle(runtime.deps, threadId);
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
    return internalServerErrorResponse(
      error instanceof Error ? error.message : "Thread retrieval failed."
    );
  }
}

export async function handleRevertThreadRoute<TRequest, TVersion>(
  request: Request,
  threadId: string,
  config: {
    schema: SafeParseSchema<TRequest>;
    revertThread: (deps: RuntimeDeps, threadId: string, payload: TRequest) => Promise<TVersion>;
  }
): Promise<Response> {
  const runtime = await resolveRuntimeDeps();
  if (!runtime.ok) {
    return runtime.response;
  }

  const parsed = await parseRequestWithSchema(request, config.schema, { rejectMalformedJson: true });
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const version = await config.revertThread(runtime.deps, threadId, parsed.data);
    return Response.json({ version }, { status: 201 });
  } catch (error) {
    if (isPersistenceNotFoundError(error)) {
      return Response.json(
        {
          error: "REVERT_FAILED",
          message: error.message
        },
        { status: 404 }
      );
    }

    return internalServerErrorResponse(
      error instanceof Error ? error.message : "Could not revert thread."
    );
  }
}

export async function handleGenerateRoute<TRequest extends { threadId: string; baseVersionId: string | null }, TEvent>(
  request: Request,
  config: {
    schema: SafeParseSchema<TRequest>;
    getBaseVersion: (deps: RuntimeDeps, payload: TRequest) => Promise<unknown | null>;
    runGeneration: (payload: TRequest, deps: RuntimeDeps) => AsyncIterable<TEvent>;
    formatEvent: (event: TEvent) => string;
    buildErrorEvent: (message: string) => TEvent;
  }
): Promise<Response> {
  const parsed = await parseRequestWithSchema(request, config.schema, { rejectMalformedJson: false });
  if (!parsed.ok) {
    return parsed.response;
  }

  const runtime = await resolveRuntimeDeps();
  if (!runtime.ok) {
    return runtime.response;
  }

  if (parsed.data.baseVersionId) {
    try {
      const baseVersion = await config.getBaseVersion(runtime.deps, parsed.data);
      if (!baseVersion) {
        return Response.json(
          {
            error: "BASE_VERSION_CONFLICT",
            message: `Base version '${parsed.data.baseVersionId}' was not found. Refresh thread state and retry.`
          },
          { status: 409 }
        );
      }
    } catch (error) {
      return internalServerErrorResponse(
        error instanceof Error ? error.message : "Failed to read base version."
      );
    }
  }

  return createSseResponse(
    config.runGeneration(parsed.data, runtime.deps),
    config.formatEvent,
    config.buildErrorEvent
  );
}
