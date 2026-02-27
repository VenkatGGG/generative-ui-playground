import type { StreamEvent, UISpec } from "@repo/contracts";
import { applySpecPatches } from "@repo/spec-engine";

export interface GenerationState {
  generationId: string | null;
  isStreaming: boolean;
  spec: UISpec | null;
  warnings: Array<{ code: string; message: string }>;
  error: { code: string; message: string } | null;
  latestVersionId: string | null;
}

export const initialGenerationState: GenerationState = {
  generationId: null,
  isStreaming: false,
  spec: null,
  warnings: [],
  error: null,
  latestVersionId: null
};

export function generationReducer(state: GenerationState, event: StreamEvent): GenerationState {
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
        } satisfies UISpec);

      const spec = applySpecPatches(baseSpec, [event.patch]);

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
