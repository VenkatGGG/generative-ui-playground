import type { UISpecElementV2, UISpecV2 } from "@repo/contracts";

export type StructuralIssueSeverityV2 = "error" | "warning";

export interface StructuralIssueV2 {
  severity: StructuralIssueSeverityV2;
  code:
    | "V2_STRUCT_MISSING_ROOT"
    | "V2_STRUCT_ROOT_NOT_FOUND"
    | "V2_STRUCT_EMPTY_SPEC"
    | "V2_STRUCT_MISSING_CHILD"
    | "V2_STRUCT_MISSING_SLOT_CHILD"
    | "V2_STRUCT_VISIBLE_IN_PROPS"
    | "V2_STRUCT_ON_IN_PROPS"
    | "V2_STRUCT_REPEAT_IN_PROPS"
    | "V2_STRUCT_WATCH_IN_PROPS"
    | "V2_STRUCT_SLOTS_IN_PROPS"
    | "V2_STRUCT_ORPHANED_ELEMENT";
  message: string;
  elementId?: string;
}

export interface StructuralValidationResultV2 {
  valid: boolean;
  issues: StructuralIssueV2[];
}

export interface StructuralValidationOptionsV2 {
  checkOrphans?: boolean;
}

export function validateStructuralSpecV2(
  spec: UISpecV2,
  options: StructuralValidationOptionsV2 = {}
): StructuralValidationResultV2 {
  const issues: StructuralIssueV2[] = [];
  const checkOrphans = options.checkOrphans ?? false;

  if (!spec.root) {
    issues.push({
      severity: "error",
      code: "V2_STRUCT_MISSING_ROOT",
      message: "Spec root is missing."
    });
    return { valid: false, issues };
  }

  if (!spec.elements[spec.root]) {
    issues.push({
      severity: "error",
      code: "V2_STRUCT_ROOT_NOT_FOUND",
      message: `Root element '${spec.root}' does not exist in elements map.`
    });
  }

  if (Object.keys(spec.elements).length === 0) {
    issues.push({
      severity: "error",
      code: "V2_STRUCT_EMPTY_SPEC",
      message: "Spec has no elements."
    });
    return { valid: false, issues };
  }

  for (const [elementId, element] of Object.entries(spec.elements)) {
    for (const childId of element.children) {
      if (!spec.elements[childId]) {
        issues.push({
          severity: "error",
          code: "V2_STRUCT_MISSING_CHILD",
          message: `Element '${elementId}' references missing child '${childId}'.`,
          elementId
        });
      }
    }

    if (element.slots) {
      for (const [slotName, slotChildren] of Object.entries(element.slots)) {
        for (const childId of slotChildren) {
          if (!spec.elements[childId]) {
            issues.push({
              severity: "error",
              code: "V2_STRUCT_MISSING_SLOT_CHILD",
              message: `Element '${elementId}' slot '${slotName}' references missing child '${childId}'.`,
              elementId
            });
          }
        }
      }
    }

    const props = element.props as Record<string, unknown> | undefined;
    if (props && props.visible !== undefined) {
      issues.push({
        severity: "error",
        code: "V2_STRUCT_VISIBLE_IN_PROPS",
        message: `Element '${elementId}' has 'visible' in props. Move it to the element top-level field.`,
        elementId
      });
    }
    if (props && props.on !== undefined) {
      issues.push({
        severity: "error",
        code: "V2_STRUCT_ON_IN_PROPS",
        message: `Element '${elementId}' has 'on' in props. Move it to the element top-level field.`,
        elementId
      });
    }
    if (props && props.repeat !== undefined) {
      issues.push({
        severity: "error",
        code: "V2_STRUCT_REPEAT_IN_PROPS",
        message: `Element '${elementId}' has 'repeat' in props. Move it to the element top-level field.`,
        elementId
      });
    }
    if (props && props.watch !== undefined) {
      issues.push({
        severity: "error",
        code: "V2_STRUCT_WATCH_IN_PROPS",
        message: `Element '${elementId}' has 'watch' in props. Move it to the element top-level field.`,
        elementId
      });
    }
    if (props && props.slots !== undefined) {
      issues.push({
        severity: "error",
        code: "V2_STRUCT_SLOTS_IN_PROPS",
        message: `Element '${elementId}' has 'slots' in props. Move it to the element top-level field.`,
        elementId
      });
    }
  }

  if (checkOrphans && spec.elements[spec.root]) {
    const reachable = new Set<string>();
    const visit = (id: string): void => {
      if (reachable.has(id)) {
        return;
      }
      reachable.add(id);
      const element = spec.elements[id];
      if (!element) {
        return;
      }
      for (const childId of element.children) {
        if (spec.elements[childId]) {
          visit(childId);
        }
      }
      for (const slotChildren of Object.values(element.slots ?? {})) {
        for (const childId of slotChildren) {
          if (spec.elements[childId]) {
            visit(childId);
          }
        }
      }
    };
    visit(spec.root);

    for (const elementId of Object.keys(spec.elements)) {
      if (reachable.has(elementId)) {
        continue;
      }
      issues.push({
        severity: "warning",
        code: "V2_STRUCT_ORPHANED_ELEMENT",
        message: `Element '${elementId}' is not reachable from root '${spec.root}'.`,
        elementId
      });
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues
  };
}

export function autoFixStructuralSpecV2(spec: UISpecV2): { spec: UISpecV2; fixes: string[] } {
  const fixes: string[] = [];
  const fixedElements: Record<string, UISpecElementV2> = {};

  for (const [elementId, element] of Object.entries(spec.elements)) {
    const props = { ...(element.props ?? {}) } as Record<string, unknown>;
    const next: UISpecElementV2 = {
      ...element,
      props
    };

    if (props.visible !== undefined && next.visible === undefined) {
      next.visible = props.visible as UISpecElementV2["visible"];
      delete props.visible;
      fixes.push(`Moved 'visible' out of props on '${elementId}'.`);
    }
    if (props.on !== undefined && next.on === undefined) {
      next.on = props.on as UISpecElementV2["on"];
      delete props.on;
      fixes.push(`Moved 'on' out of props on '${elementId}'.`);
    }
    if (props.repeat !== undefined && next.repeat === undefined) {
      next.repeat = props.repeat as UISpecElementV2["repeat"];
      delete props.repeat;
      fixes.push(`Moved 'repeat' out of props on '${elementId}'.`);
    }
    if (props.watch !== undefined && next.watch === undefined) {
      next.watch = props.watch as UISpecElementV2["watch"];
      delete props.watch;
      fixes.push(`Moved 'watch' out of props on '${elementId}'.`);
    }
    if (props.slots !== undefined && next.slots === undefined) {
      next.slots = props.slots as UISpecElementV2["slots"];
      delete props.slots;
      fixes.push(`Moved 'slots' out of props on '${elementId}'.`);
    }

    fixedElements[elementId] = next;
  }

  const fixedSpec: UISpecV2 = {
    root: spec.root,
    elements: fixedElements,
    ...(spec.state !== undefined ? { state: spec.state } : {})
  };

  return {
    spec: fixedSpec,
    fixes
  };
}
