import type { MCPComponentContext } from "../interfaces";

export function buildComponentContextPromptSection(context: MCPComponentContext): string {
  if (context.componentRules.length === 0) {
    return "MCP CONTEXT RULES: none.";
  }

  const lines: string[] = [];
  lines.push(`MCP CONTEXT RULES (${context.contextVersion}):`);

  for (const rule of context.componentRules) {
    const props = rule.allowedProps.length > 0 ? rule.allowedProps.join(", ") : "none";
    const variants = rule.variants.length > 0 ? rule.variants.join(", ") : "none";
    const composition = rule.compositionRules.length > 0
      ? rule.compositionRules.join(" ")
      : "none";

    lines.push(
      `- ${rule.name}: allowedProps [${props}]; variants [${variants}]; composition [${composition}]; notes: ${rule.notes}`
    );
  }

  return lines.join("\n");
}
