import {
  ActionBindingV2Schema,
  DynamicValueExprV2Schema,
  UISpecV2Schema,
  VisibilityConditionV2Schema,
  type UISpecV2
} from "@repo/contracts";
import { getValueAtStatePath } from "./runtime-v2";

export interface ValidationOptionsV2 {
  maxDepth?: number;
  maxNodes?: number;
  allowedComponentTypes?: Set<string>;
}

export interface SpecEngineIssueV2 {
  code:
    | "V2_INVALID_SCHEMA"
    | "V2_MISSING_ROOT"
    | "V2_MISSING_ROOT_ELEMENT"
    | "V2_MISSING_CHILD_ELEMENT"
    | "V2_MAX_DEPTH_EXCEEDED"
    | "V2_MAX_NODES_EXCEEDED"
    | "V2_UNKNOWN_COMPONENT"
    | "V2_INVALID_REPEAT_STATE_PATH"
    | "V2_REPEAT_NOT_ARRAY"
    | "V2_INVALID_ACTION_NAME"
    | "V2_INVALID_DYNAMIC_EXPRESSION"
    | "V2_INVALID_VISIBLE_EXPRESSION"
    | "V2_INVALID_COMPONENT_PROPS";
  message: string;
  elementId?: string;
}

export interface ValidationResultV2 {
  valid: boolean;
  issues: SpecEngineIssueV2[];
}

const BUILT_IN_ACTIONS = new Set(["setState", "pushState", "removeState", "validateForm"]);

function hasAnyDollarKey(record: Record<string, unknown>): boolean {
  return Object.keys(record).some((key) => key.startsWith("$"));
}

function validateDynamicExpressionTree(
  value: unknown,
  issues: SpecEngineIssueV2[],
  elementId: string,
  path: string
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validateDynamicExpressionTree(entry, issues, elementId, `${path}[${index}]`)
    );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  if (hasAnyDollarKey(record)) {
    const result = DynamicValueExprV2Schema.safeParse(record);
    if (!result.success) {
      issues.push({
        code: "V2_INVALID_DYNAMIC_EXPRESSION",
        message: `Element '${elementId}' has invalid dynamic expression at '${path}'.`,
        elementId
      });
      return;
    }
  }

  for (const [key, nested] of Object.entries(record)) {
    validateDynamicExpressionTree(nested, issues, elementId, `${path}.${key}`);
  }
}

function validateComponentPropsV2(
  spec: UISpecV2,
  issues: SpecEngineIssueV2[],
  elementId: string
): void {
  const element = spec.elements[elementId];
  if (!element) {
    return;
  }

  if (element.type === "Input") {
    const value = element.props.value;
    if (value !== undefined && typeof value !== "string" && typeof value !== "number" && typeof value !== "object") {
      issues.push({
        code: "V2_INVALID_COMPONENT_PROPS",
        message: `Input '${elementId}' expects 'value' to be string/number/expression.`,
        elementId
      });
    }
  }

  if (element.type === "Textarea") {
    const rows = element.props.rows;
    if (rows !== undefined && typeof rows !== "number") {
      issues.push({
        code: "V2_INVALID_COMPONENT_PROPS",
        message: `Textarea '${elementId}' expects 'rows' to be a number.`,
        elementId
      });
    }
  }

  if (element.type === "Checkbox") {
    const checked = element.props.checked;
    if (checked !== undefined && typeof checked !== "boolean" && typeof checked !== "object") {
      issues.push({
        code: "V2_INVALID_COMPONENT_PROPS",
        message: `Checkbox '${elementId}' expects 'checked' to be boolean/expression.`,
        elementId
      });
    }
  }

  if (element.type === "Select") {
    const options = element.props.options;
    if (!Array.isArray(options)) {
      issues.push({
        code: "V2_INVALID_COMPONENT_PROPS",
        message: `Select '${elementId}' expects 'options' to be an array.`,
        elementId
      });
      return;
    }
    for (const option of options) {
      const isString = typeof option === "string";
      const isObject =
        option !== null &&
        typeof option === "object" &&
        !Array.isArray(option) &&
        typeof (option as Record<string, unknown>).label === "string" &&
        typeof (option as Record<string, unknown>).value === "string";
      if (!isString && !isObject) {
        issues.push({
          code: "V2_INVALID_COMPONENT_PROPS",
          message: `Select '${elementId}' has an invalid option shape.`,
          elementId
        });
        return;
      }
    }
  }
}

function validateActionBindings(
  value: unknown,
  issues: SpecEngineIssueV2[],
  elementId: string
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const bindingOrBindings of Object.values(value as Record<string, unknown>)) {
    const bindings = Array.isArray(bindingOrBindings) ? bindingOrBindings : [bindingOrBindings];
    for (const binding of bindings) {
      const parsed = ActionBindingV2Schema.safeParse(binding);
      if (!parsed.success) {
        issues.push({
          code: "V2_INVALID_ACTION_NAME",
          message: `Element '${elementId}' has an invalid action binding contract.`,
          elementId
        });
        continue;
      }

      if (!BUILT_IN_ACTIONS.has(parsed.data.action)) {
        issues.push({
          code: "V2_INVALID_ACTION_NAME",
          message: `Element '${elementId}' uses unsupported action '${parsed.data.action}'.`,
          elementId
        });
      }

      if (parsed.data.params) {
        validateDynamicExpressionTree(parsed.data.params, issues, elementId, "action.params");
      }
    }
  }
}

function validateVisibleExpression(
  value: unknown,
  issues: SpecEngineIssueV2[],
  elementId: string
): void {
  if (value === undefined) {
    return;
  }
  const parsed = VisibilityConditionV2Schema.safeParse(value);
  if (!parsed.success) {
    issues.push({
      code: "V2_INVALID_VISIBLE_EXPRESSION",
      message: `Element '${elementId}' has invalid 'visible' expression syntax.`,
      elementId
    });
  }
}

export function validateSpecV2(spec: UISpecV2, options: ValidationOptionsV2 = {}): ValidationResultV2 {
  const issues: SpecEngineIssueV2[] = [];
  const parseResult = UISpecV2Schema.safeParse(spec);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      const path = issue.path.map((segment) => String(segment)).join(".");

      if (path.includes(".visible") || path.endsWith("visible")) {
        issues.push({
          code: "V2_INVALID_VISIBLE_EXPRESSION",
          message: `Invalid visible expression: ${issue.message}`
        });
        continue;
      }

      if (path.includes(".repeat") || path.endsWith("repeat")) {
        issues.push({
          code: "V2_INVALID_REPEAT_STATE_PATH",
          message: `Invalid repeat contract: ${issue.message}`
        });
        continue;
      }

      if (path.includes(".on") || path.includes(".watch")) {
        issues.push({
          code: "V2_INVALID_ACTION_NAME",
          message: `Invalid action binding contract: ${issue.message}`
        });
        continue;
      }

      if (path.includes(".props")) {
        issues.push({
          code: "V2_INVALID_COMPONENT_PROPS",
          message: `Invalid props contract: ${issue.message}`
        });
        continue;
      }
    }

    if (issues.length === 0) {
      issues.push({
        code: "V2_INVALID_SCHEMA",
        message: parseResult.error.issues.map((issue) => issue.message).join("; ")
      });
    }
    return { valid: false, issues };
  }

  const maxDepth = options.maxDepth ?? 30;
  const maxNodes = options.maxNodes ?? 1500;

  if (!spec.root) {
    issues.push({ code: "V2_MISSING_ROOT", message: "Spec root is missing." });
    return { valid: false, issues };
  }

  if (!spec.elements[spec.root]) {
    issues.push({
      code: "V2_MISSING_ROOT_ELEMENT",
      message: `Root element '${spec.root}' is not defined.`
    });
    return { valid: false, issues };
  }

  const allElementIds = Object.keys(spec.elements);
  if (allElementIds.length > maxNodes) {
    issues.push({
      code: "V2_MAX_NODES_EXCEEDED",
      message: `Spec has ${allElementIds.length} elements which exceeds maxNodes=${maxNodes}.`
    });
  }

  const allowed = options.allowedComponentTypes;
  if (allowed) {
    for (const [id, element] of Object.entries(spec.elements)) {
      if (!allowed.has(element.type)) {
        issues.push({
          code: "V2_UNKNOWN_COMPONENT",
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
        code: "V2_MAX_DEPTH_EXCEEDED",
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
        code: "V2_MISSING_CHILD_ELEMENT",
        message: `Element '${elementId}' is referenced but not defined.`,
        elementId
      });
      return;
    }

    validateVisibleExpression(element.visible, issues, elementId);
    validateActionBindings(element.on, issues, elementId);
    validateActionBindings(element.watch, issues, elementId);
    validateDynamicExpressionTree(element.props, issues, elementId, "props");
    validateComponentPropsV2(spec, issues, elementId);

    if (element.repeat) {
      if (!element.repeat.statePath.startsWith("/")) {
        issues.push({
          code: "V2_INVALID_REPEAT_STATE_PATH",
          message: `Element '${elementId}' has invalid repeat statePath '${element.repeat.statePath}'.`,
          elementId
        });
      } else {
        const resolved = getValueAtStatePath(spec.state, element.repeat.statePath);
        if (resolved !== undefined && !Array.isArray(resolved)) {
          issues.push({
            code: "V2_REPEAT_NOT_ARRAY",
            message: `Element '${elementId}' repeat path '${element.repeat.statePath}' does not resolve to an array.`,
            elementId
          });
        }
      }
    }

    for (const childId of element.children) {
      if (!spec.elements[childId]) {
        issues.push({
          code: "V2_MISSING_CHILD_ELEMENT",
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
