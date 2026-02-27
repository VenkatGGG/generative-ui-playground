import { UISpecSchema, type UISpec } from "@repo/contracts";

export interface SpecEngineIssue {
  code:
    | "INVALID_SCHEMA"
    | "MISSING_ROOT"
    | "MISSING_ROOT_ELEMENT"
    | "MISSING_CHILD_ELEMENT"
    | "MAX_DEPTH_EXCEEDED"
    | "MAX_NODES_EXCEEDED"
    | "UNKNOWN_COMPONENT";
  message: string;
  elementId?: string;
}

export interface ValidationOptions {
  maxDepth?: number;
  maxNodes?: number;
  allowedComponentTypes?: Set<string>;
}

export interface ValidationResult {
  valid: boolean;
  issues: SpecEngineIssue[];
}

export function validateSpec(spec: UISpec, options: ValidationOptions = {}): ValidationResult {
  const issues: SpecEngineIssue[] = [];

  const parseResult = UISpecSchema.safeParse(spec);
  if (!parseResult.success) {
    issues.push({
      code: "INVALID_SCHEMA",
      message: parseResult.error.issues.map((issue) => issue.message).join("; ")
    });
    return { valid: false, issues };
  }

  const maxDepth = options.maxDepth ?? 30;
  const maxNodes = options.maxNodes ?? 1500;

  if (!spec.root) {
    issues.push({ code: "MISSING_ROOT", message: "Spec root is missing." });
    return { valid: false, issues };
  }

  const rootElement = spec.elements[spec.root];
  if (!rootElement) {
    issues.push({
      code: "MISSING_ROOT_ELEMENT",
      message: `Root element '${spec.root}' is not defined.`
    });
    return { valid: false, issues };
  }

  const allElementIds = Object.keys(spec.elements);
  if (allElementIds.length > maxNodes) {
    issues.push({
      code: "MAX_NODES_EXCEEDED",
      message: `Spec has ${allElementIds.length} elements which exceeds maxNodes=${maxNodes}.`
    });
  }

  const allowed = options.allowedComponentTypes;
  if (allowed) {
    for (const [id, element] of Object.entries(spec.elements)) {
      if (!allowed.has(element.type)) {
        issues.push({
          code: "UNKNOWN_COMPONENT",
          message: `Element '${id}' has unsupported component type '${element.type}'.`,
          elementId: id
        });
      }
    }
  }

  const visited = new Set<string>();

  const walk = (elementId: string, depth: number): void => {
    if (depth > maxDepth) {
      issues.push({
        code: "MAX_DEPTH_EXCEEDED",
        message: `Element '${elementId}' exceeded maxDepth=${maxDepth}.`,
        elementId
      });
      return;
    }

    if (visited.has(elementId)) {
      return;
    }

    visited.add(elementId);

    const element = spec.elements[elementId];
    if (!element) {
      issues.push({
        code: "MISSING_CHILD_ELEMENT",
        message: `Element '${elementId}' is referenced but not defined.`,
        elementId
      });
      return;
    }

    for (const childId of element.children) {
      if (!spec.elements[childId]) {
        issues.push({
          code: "MISSING_CHILD_ELEMENT",
          message: `Element '${elementId}' references missing child '${childId}'.`,
          elementId
        });
      } else {
        walk(childId, depth + 1);
      }
    }
  };

  walk(spec.root, 0);

  return {
    valid: issues.length === 0,
    issues
  };
}
