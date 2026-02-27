import { StreamEventSchema, type StreamEvent } from "@repo/contracts";

export interface StreamGenerateOptions {
  endpoint: string;
  body: Record<string, unknown>;
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
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
    throw new Error(`Generation request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const event = parseDataLine(line);
        if (event) {
          options.onEvent(event);
        }
      }
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      if (!line.startsWith("data:")) {
        continue;
      }
      const event = parseDataLine(line);
      if (event) {
        options.onEvent(event);
      }
    }
  }
}

export function formatSseEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
