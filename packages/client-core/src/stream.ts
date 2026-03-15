import { StreamEventSchema, type StreamEvent } from "@repo/contracts";
import { formatSseEventData, streamSseRequest } from "./stream-core";

export interface StreamGenerateOptions {
  endpoint: string;
  body: Record<string, unknown>;
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

export class StreamGenerateError extends Error {
  public readonly code: "HTTP_ERROR" | "STREAM_INTERRUPTED";
  public readonly status?: number;

  public constructor(
    code: "HTTP_ERROR" | "STREAM_INTERRUPTED",
    message: string,
    status?: number
  ) {
    super(message);
    this.name = "StreamGenerateError";
    this.code = code;
    this.status = status;
  }
}

function validateStreamEvent(input: unknown): StreamEvent | null {
  const validated = StreamEventSchema.safeParse(input);
  if (!validated.success) {
    return null;
  }

  return validated.data;
}

export async function streamGenerate(options: StreamGenerateOptions): Promise<void> {
  await streamSseRequest({
    ...options,
    validateEvent: validateStreamEvent,
    createError: (code, message, status) => new StreamGenerateError(code, message, status)
  });
}

export function formatSseEvent(event: StreamEvent): string {
  return formatSseEventData(event);
}
