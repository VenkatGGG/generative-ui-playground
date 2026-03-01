import type { StreamEventV2, UISpecV2 } from "@repo/contracts";
import { applySpecPatches } from "@repo/spec-engine";

export interface GenerationUsageV2 {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model?: string;
}

export interface GenerationStateV2 {
  generationId: string | null;
  isStreaming: boolean;
  spec: UISpecV2 | null;
  warnings: Array<{ code: string; message: string }>;
  error: { code: string; message: string } | null;
  latestVersionId: string | null;
  usage: GenerationUsageV2 | null;
}

export const initialGenerationStateV2: GenerationStateV2 = {
  generationId: null,
  isStreaming: false,
  spec: null,
  warnings: [],
  error: null,
  latestVersionId: null,
  usage: null
};

export function generationReducerV2(state: GenerationStateV2, event: StreamEventV2): GenerationStateV2 {
  switch (event.type) {
    case "status": {
      return {
        ...state,
        generationId: event.generationId,
        isStreaming: true,
        error: null
      };
    }
    case "patch": {
      const baseSpec =
        state.spec ??
        ({
          root: "",
          elements: {}
        } satisfies UISpecV2);

      const spec = applySpecPatches(baseSpec, [event.patch]) as UISpecV2;
      return {
        ...state,
        generationId: event.generationId,
        isStreaming: true,
        spec
      };
    }
    case "warning": {
      return {
        ...state,
        warnings: [...state.warnings, { code: event.code, message: event.message }]
      };
    }
    case "usage": {
      return {
        ...state,
        usage: {
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          totalTokens: event.totalTokens,
          model: event.model
        }
      };
    }
    case "error": {
      return {
        ...state,
        isStreaming: false,
        error: {
          code: event.code,
          message: event.message
        }
      };
    }
    case "done": {
      return {
        ...state,
        isStreaming: false,
        latestVersionId: event.versionId
      };
    }
    default:
      return state;
  }
}
