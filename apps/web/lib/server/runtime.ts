import { createStubGenerationModel, createStubMcpAdapter } from "@repo/integrations";
import { InMemoryPersistenceAdapter } from "@repo/persistence";
import type { OrchestratorDeps } from "@repo/orchestrator";

const model = createStubGenerationModel();
const mcp = createStubMcpAdapter();
const persistence = new InMemoryPersistenceAdapter();

export const runtimeDeps: OrchestratorDeps = {
  model,
  mcp,
  persistence
};
