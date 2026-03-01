import type { UIComponentNode, UISpec, UISpecV2 } from "@repo/contracts";

export interface ExtractComponentsInput {
  prompt: string;
  previousSpec: UISpec | UISpecV2 | null;
}

export interface ExtractComponentsResult {
  components: string[];
  intentType: "new" | "modify";
  confidence: number;
}

export interface StreamDesignInput {
  prompt: string;
  previousSpec: UISpec | UISpecV2 | null;
  componentContext: MCPComponentContext;
}

export interface StreamDesignInputV2 {
  prompt: string;
  previousSpec: UISpecV2 | null;
  componentContext: MCPComponentContext;
}

export interface MCPComponentContext {
  contextVersion: string;
  componentRules: Array<{
    name: string;
    allowedProps: string[];
    variants: string[];
    compositionRules: string[];
    supportedEvents: string[];
    bindingHints: string[];
    notes: string;
  }>;
}

export interface GenerationModelAdapter {
  extractComponents(input: ExtractComponentsInput): Promise<ExtractComponentsResult>;
  streamDesign(input: StreamDesignInput): AsyncIterable<string>;
  streamDesignV2?(input: StreamDesignInputV2): AsyncIterable<string>;
}

export interface MCPAdapter {
  fetchContext(componentNames: string[]): Promise<MCPComponentContext>;
}

export interface ParsedCandidate {
  node: UIComponentNode;
}
