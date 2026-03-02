import {
  canonicalizeCatalogComponentTypeV2
} from "@repo/component-catalog";
import type { UISpecV2 } from "@repo/contracts";
import type { ExtractComponentsResult } from "@repo/integrations";

const CARD_HINT = /\b(card|pricing|plan|dashboard|hero)\b/i;
const FORM_HINT = /\b(form|login|sign[- ]?up|input|textarea|select|checkbox|submit)\b/i;
const BUTTON_HINT = /\b(button|cta|submit|action|trial|buy|subscribe)\b/i;
const FORM_CONTROL_TYPES = new Set(["Input", "Textarea", "Select", "Checkbox"]);

export interface ConstraintSetV2 {
  requiredComponentTypes: Set<string>;
  requireCardStructure: boolean;
  requireFormControls: boolean;
}

export interface ConstraintViolationV2 {
  code: "V2_CARD_STRUCTURE_MISSING" | "V2_REQUIRED_COMPONENT_MISSING";
  message: string;
}

export interface BuildConstraintInputV2 {
  prompt: string;
  pass1: ExtractComponentsResult;
}

function hasAnyType(spec: UISpecV2, types: Set<string>): boolean {
  return Object.values(spec.elements).some((element) => types.has(element.type));
}

export function buildConstraintSetV2(input: BuildConstraintInputV2): ConstraintSetV2 {
  const requiredComponentTypes = new Set<string>();

  const prompt = input.prompt;
  const pass1HasCard = input.pass1.components.some(
    (component) => canonicalizeCatalogComponentTypeV2(component) === "Card"
  );
  const pass1HasFormControl = input.pass1.components.some((component) =>
    FORM_CONTROL_TYPES.has(canonicalizeCatalogComponentTypeV2(component))
  );
  const pass1HasButton = input.pass1.components.some(
    (component) => canonicalizeCatalogComponentTypeV2(component) === "Button"
  );

  const requireCardStructure = CARD_HINT.test(prompt) || pass1HasCard;
  const requireFormControls = FORM_HINT.test(prompt) || pass1HasFormControl;
  const requireButton = BUTTON_HINT.test(prompt) || pass1HasButton || requireFormControls;

  if (requireCardStructure) {
    requiredComponentTypes.add("Card");
    requiredComponentTypes.add("CardHeader");
    requiredComponentTypes.add("CardContent");
  }
  if (requireButton) {
    requiredComponentTypes.add("Button");
  }

  return {
    requiredComponentTypes,
    requireCardStructure,
    requireFormControls
  };
}

export function validateConstraintSetV2(
  spec: UISpecV2,
  constraints: ConstraintSetV2
): ConstraintViolationV2[] {
  const violations: ConstraintViolationV2[] = [];
  const elementTypes = new Set(Object.values(spec.elements).map((element) => element.type));

  if (constraints.requireCardStructure && elementTypes.has("Card")) {
    if (!elementTypes.has("CardHeader") || !elementTypes.has("CardContent")) {
      violations.push({
        code: "V2_CARD_STRUCTURE_MISSING",
        message: "Card-like prompts require CardHeader and CardContent."
      });
    }
  }

  if (constraints.requireFormControls && !hasAnyType(spec, FORM_CONTROL_TYPES)) {
    violations.push({
      code: "V2_REQUIRED_COMPONENT_MISSING",
      message: "Form-like prompts require at least one of Input, Textarea, Select, or Checkbox."
    });
  }

  for (const requiredType of constraints.requiredComponentTypes) {
    if (!elementTypes.has(requiredType)) {
      violations.push({
        code: "V2_REQUIRED_COMPONENT_MISSING",
        message: `Required component type '${requiredType}' was not generated.`
      });
    }
  }

  return violations;
}
