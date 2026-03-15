import type { GenerationModelAdapter, MCPAdapter } from "@repo/integrations";
import type {
  PersistenceAdapter,
  PersistenceAdapterV1,
  PersistenceAdapterV2
} from "@repo/persistence";

export interface RuntimeDeps {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapter;
}

export interface OrchestratorRuntimeDeps {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapterV1;
}

export interface OrchestratorRuntimeDepsV2 {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapterV2;
}
