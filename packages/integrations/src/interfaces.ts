import type { UIComponentNode, UISpec } from "@repo/contracts";

export interface ExtractComponentsInput {
  prompt: string;
  previousSpec: UISpec | null;
}

export interface ExtractComponentsResult {
  components: string[];
  intentType: "new" | "modify";
  confidence: number;
}

export interface StreamDesignInput {
  prompt: string;
  previousSpec: UISpec | null;
  componentContext: MCPComponentContext;
}

export interface MCPComponentContext {
  contextVersion: string;
  componentRules: Array<{
    name: string;
    allowedProps: string[];
    variants: string[];
    notes: string;
  }>;
}

export interface GenerationModelAdapter {
  extractComponents(input: ExtractComponentsInput): Promise<ExtractComponentsResult>;
  streamDesign(input: StreamDesignInput): AsyncIterable<string>;
}

export interface MCPAdapter {
  fetchContext(componentNames: string[]): Promise<MCPComponentContext>;
}

export interface ParsedCandidate {
  node: UIComponentNode;
}
