import { StreamEventV2Schema, type StreamEventV2 } from "@repo/contracts";
import { formatSseEventData, streamSseRequest } from "./stream-core";

export interface StreamGenerateOptionsV2 {
  endpoint: string;
  body: Record<string, unknown>;
  onEvent: (event: StreamEventV2) => void;
  signal?: AbortSignal;
}

export class StreamGenerateErrorV2 extends Error {
  public readonly code: "HTTP_ERROR" | "STREAM_INTERRUPTED";
  public readonly status?: number;

  public constructor(
    code: "HTTP_ERROR" | "STREAM_INTERRUPTED",
    message: string,
    status?: number
  ) {
    super(message);
    this.name = "StreamGenerateErrorV2";
    this.code = code;
    this.status = status;
  }
}

function validateStreamEventV2(input: unknown): StreamEventV2 | null {
  const validated = StreamEventV2Schema.safeParse(input);
  if (!validated.success) {
    return null;
  }

  return validated.data;
}

export async function streamGenerateV2(options: StreamGenerateOptionsV2): Promise<void> {
  await streamSseRequest({
    ...options,
    validateEvent: validateStreamEventV2,
    createError: (code, message, status) => new StreamGenerateErrorV2(code, message, status)
  });
}

export function formatSseEventV2(event: StreamEventV2): string {
  return formatSseEventData(event);
}
