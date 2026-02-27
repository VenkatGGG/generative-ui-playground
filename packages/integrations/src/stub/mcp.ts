import type { MCPAdapter } from "../interfaces";

export function createStubMcpAdapter(): MCPAdapter {
  return {
    async fetchContext(componentNames) {
      return {
        contextVersion: "stub-context-v1",
        componentRules: componentNames.map((name) => ({
          name,
          allowedProps: ["className", "variant", "size"],
          variants: ["default", "secondary", "outline", "destructive"],
          notes: `${name} follows the local shadcn-like contract in stub mode.`
        }))
      };
    }
  };
}
