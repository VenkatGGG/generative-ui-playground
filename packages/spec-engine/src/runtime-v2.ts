import type { DynamicValueExprV2, UISpecV2, VisibilityConditionV2 } from "@repo/contracts";

export interface RepeatScopeV2 {
  item: unknown;
  index: number;
}

export interface RuntimeResolveContextV2 {
  state: Record<string, unknown> | undefined;
  scope?: RepeatScopeV2;
}

export interface StateBindingRefV2 {
  kind: "state";
  path: string;
}

export interface ItemBindingRefV2 {
  kind: "item";
  field: string;
}

export type BindingRefV2 = StateBindingRefV2 | ItemBindingRefV2;

function splitPointerPath(path: string): string[] | null {
  if (path === "/") {
    return [];
  }
  if (!path.startsWith("/")) {
    return null;
  }
  return path
    .slice(1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

export function getValueAtStatePath(
  state: Record<string, unknown> | undefined,
  path: string
): unknown {
  if (!state) {
    return undefined;
  }
  const segments = splitPointerPath(path);
  if (!segments) {
    return undefined;
  }
  let current: unknown = state;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isFinite(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function getRepeatItemField(item: unknown, field: string): unknown {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }
  return (item as Record<string, unknown>)[field];
}

function isDynamicValueExpr(value: unknown): value is DynamicValueExprV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.$state === "string" ||
    typeof record.$item === "string" ||
    record.$index === true ||
    typeof record.$bindState === "string" ||
    typeof record.$bindItem === "string"
  );
}

export function resolveDynamicValueV2(
  value: unknown,
  context: RuntimeResolveContextV2
): unknown | BindingRefV2 {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveDynamicValueV2(entry, context));
  }

  if (value && typeof value === "object") {
    if (isDynamicValueExpr(value)) {
      const expr = value as DynamicValueExprV2;
      if ("$state" in expr) {
        const resolved = getValueAtStatePath(context.state, expr.$state);
        return resolved === undefined ? expr.default : resolved;
      }
      if ("$item" in expr) {
        const resolved = context.scope ? getRepeatItemField(context.scope.item, expr.$item) : undefined;
        return resolved === undefined ? expr.default : resolved;
      }
      if ("$index" in expr) {
        return context.scope?.index ?? 0;
      }
      if ("$bindState" in expr) {
        return { kind: "state", path: expr.$bindState } satisfies StateBindingRefV2;
      }
      if ("$bindItem" in expr) {
        return { kind: "item", field: expr.$bindItem } satisfies ItemBindingRefV2;
      }
    }

    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      next[key] = resolveDynamicValueV2(nested, context);
    }
    return next;
  }

  return value;
}

function compareVisibilityValues(left: unknown, condition: VisibilityConditionV2): boolean {
  if (typeof condition === "boolean") {
    return condition;
  }

  if ("eq" in condition && condition.eq !== undefined) {
    return left === condition.eq;
  }
  if ("neq" in condition && condition.neq !== undefined) {
    return left !== condition.neq;
  }
  if ("gt" in condition && condition.gt !== undefined) {
    return typeof left === "number" && left > condition.gt;
  }
  if ("gte" in condition && condition.gte !== undefined) {
    return typeof left === "number" && left >= condition.gte;
  }
  if ("lt" in condition && condition.lt !== undefined) {
    return typeof left === "number" && left < condition.lt;
  }
  if ("lte" in condition && condition.lte !== undefined) {
    return typeof left === "number" && left <= condition.lte;
  }

  return Boolean(left);
}

export function evaluateVisibilityV2(
  condition: VisibilityConditionV2 | undefined | null,
  context: RuntimeResolveContextV2
): boolean {
  if (condition === undefined || condition === null) {
    return true;
  }
  if (typeof condition === "boolean") {
    return condition;
  }
  if (typeof condition !== "object" || Array.isArray(condition)) {
    return true;
  }

  if ("$and" in condition) {
    return Array.isArray(condition.$and)
      ? condition.$and.every((entry) => evaluateVisibilityV2(entry, context))
      : true;
  }

  if ("$or" in condition) {
    return Array.isArray(condition.$or)
      ? condition.$or.some((entry) => evaluateVisibilityV2(entry, context))
      : true;
  }

  const value = getValueAtStatePath(context.state, condition.$state);
  const result = compareVisibilityValues(value, condition);
  return condition.not ? !result : result;
}

export interface RepeatExpansionV2 {
  key: string;
  scope: RepeatScopeV2;
}

export function expandRepeatScopesV2(
  spec: Pick<UISpecV2, "state">,
  statePath: string,
  keyField?: string
): RepeatExpansionV2[] {
  const stateValue = getValueAtStatePath(spec.state, statePath);
  if (!Array.isArray(stateValue)) {
    return [];
  }

  return stateValue.map((item, index) => {
    const computedKey =
      keyField && item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)[keyField]
        : undefined;

    return {
      key: String(computedKey ?? index),
      scope: {
        item,
        index
      }
    };
  });
}
