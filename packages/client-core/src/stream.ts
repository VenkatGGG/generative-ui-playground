import { StreamEventSchema, type StreamEvent } from "@repo/contracts";

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

function parseDataLine(line: string): StreamEvent | null {
  const raw = line.replace(/^data:\s?/, "").trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const validated = StreamEventSchema.safeParse(parsed);
    if (!validated.success) {
      return null;
    }

    return validated.data;
  } catch {
    return null;
  }
}

function findEventBoundary(buffer: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match || match.index === undefined) {
    return null;
  }

  return {
    index: match.index,
    length: match[0].length
  };
}

function parseEventChunk(chunk: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const event = parseDataLine(line);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

export async function streamGenerate(options: StreamGenerateOptions): Promise<void> {
  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify(options.body),
    signal: options.signal
  });

  if (!response.ok || !response.body) {
    throw new StreamGenerateError("HTTP_ERROR", `Generation request failed: ${response.status}`, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalEventSeen = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = findEventBoundary(buffer);
    while (boundary) {
      const chunk = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);

      for (const event of parseEventChunk(chunk)) {
        try {
          options.onEvent(event);
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          throw error;
        }

        if (event.type === "done" || event.type === "error") {
          terminalEventSeen = true;
          await reader.cancel().catch(() => undefined);
          return;
        }
      }

      boundary = findEventBoundary(buffer);
    }
  }

  if (buffer.trim()) {
    for (const event of parseEventChunk(buffer)) {
      options.onEvent(event);
      if (event.type === "done" || event.type === "error") {
        terminalEventSeen = true;
      }
    }
  }

  if (!terminalEventSeen) {
    throw new StreamGenerateError(
      "STREAM_INTERRUPTED",
      "Generation stream ended without a terminal done/error event."
    );
  }
}

export function formatSseEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
