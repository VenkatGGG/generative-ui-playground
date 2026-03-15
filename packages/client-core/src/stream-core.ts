type StreamErrorCode = "HTTP_ERROR" | "STREAM_INTERRUPTED";

interface StreamRequestOptions<TEvent, TError extends Error> {
  endpoint: string;
  body: Record<string, unknown>;
  onEvent: (event: TEvent) => void;
  signal?: AbortSignal;
  validateEvent: (input: unknown) => TEvent | null;
  createError: (code: StreamErrorCode, message: string, status?: number) => TError;
}

function parseDataLine<TEvent>(
  line: string,
  validateEvent: StreamRequestOptions<TEvent, Error>["validateEvent"]
): TEvent | null {
  const raw = line.replace(/^data:\s?/, "").trim();
  if (!raw) {
    return null;
  }

  try {
    return validateEvent(JSON.parse(raw));
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

function parseEventChunk<TEvent>(
  chunk: string,
  validateEvent: StreamRequestOptions<TEvent, Error>["validateEvent"]
): TEvent[] {
  const events: TEvent[] = [];
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const event = parseDataLine(line, validateEvent);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

function isTerminalEvent(event: unknown): boolean {
  if (!event || typeof event !== "object" || !("type" in event)) {
    return false;
  }

  return event.type === "done" || event.type === "error";
}

export async function streamSseRequest<TEvent, TError extends Error>(
  options: StreamRequestOptions<TEvent, TError>
): Promise<void> {
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
    throw options.createError("HTTP_ERROR", `Generation request failed: ${response.status}`, response.status);
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

      for (const event of parseEventChunk(chunk, options.validateEvent)) {
        try {
          options.onEvent(event);
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          throw error;
        }

        if (isTerminalEvent(event)) {
          terminalEventSeen = true;
          await reader.cancel().catch(() => undefined);
          return;
        }
      }

      boundary = findEventBoundary(buffer);
    }
  }

  if (buffer.trim()) {
    for (const event of parseEventChunk(buffer, options.validateEvent)) {
      options.onEvent(event);
      if (isTerminalEvent(event)) {
        terminalEventSeen = true;
      }
    }
  }

  if (!terminalEventSeen) {
    throw options.createError(
      "STREAM_INTERRUPTED",
      "Generation stream ended without a terminal done/error event."
    );
  }
}

export function formatSseEventData<TEvent>(event: TEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
