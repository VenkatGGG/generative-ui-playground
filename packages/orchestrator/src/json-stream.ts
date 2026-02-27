export interface JsonObjectExtractionResult {
  objects: string[];
  remainder: string;
}

export function extractCompleteJsonObjects(buffer: string): JsonObjectExtractionResult {
  if (!buffer) {
    return {
      objects: [],
      remainder: ""
    };
  }

  const objects: string[] = [];

  let inString = false;
  let escaped = false;
  let depth = 0;
  let objectStart = -1;
  let lastConsumed = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        objectStart = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        objects.push(buffer.slice(objectStart, index + 1));
        lastConsumed = index + 1;
        objectStart = -1;
      }
    }
  }

  if (depth > 0 && objectStart >= 0) {
    return {
      objects,
      remainder: buffer.slice(objectStart)
    };
  }

  if (lastConsumed > 0) {
    return {
      objects,
      remainder: buffer.slice(lastConsumed)
    };
  }

  return {
    objects,
    remainder: ""
  };
}
