import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { StreamEventV2, UISpecV2 } from "@repo/contracts";
import { streamGenerateV2, StreamGenerateErrorV2 } from "./stream-v2";
import {
  generationReducerV2,
  initialGenerationStateV2,
  type GenerationStateV2
} from "./state-v2";

export interface UseUIStreamV2Options {
  endpoint: string;
  onComplete?: (state: GenerationStateV2) => void;
  onError?: (error: Error) => void;
}

export interface UseUIStreamV2Result {
  state: GenerationStateV2;
  spec: UISpecV2 | null;
  isStreaming: boolean;
  rawEvents: StreamEventV2[];
  send: (body: Record<string, unknown>) => Promise<void>;
  clear: () => void;
  hydrate: (spec: UISpecV2 | null) => void;
  abort: () => void;
}

export function useUIStreamV2(options: UseUIStreamV2Options): UseUIStreamV2Result {
  const [state, dispatch] = useReducer(generationReducerV2, initialGenerationStateV2);
  const [rawEvents, setRawEvents] = useState<StreamEventV2[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const clear = useCallback(() => {
    abort();
    setRawEvents([]);
    dispatch({ type: "reset", spec: null });
  }, [abort]);

  const hydrate = useCallback((spec: UISpecV2 | null) => {
    dispatch({ type: "hydrate", spec });
  }, []);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      dispatch({ type: "reset" });
      setRawEvents([]);

      try {
        await streamGenerateV2({
          endpoint: options.endpoint,
          body,
          signal: controller.signal,
          onEvent: (event) => {
            setRawEvents((current: StreamEventV2[]) => [...current, event]);
            dispatch(event);
          }
        });

        options.onComplete?.(stateRef.current);
      } catch (error) {
        const streamError =
          error instanceof StreamGenerateErrorV2
            ? error
            : new StreamGenerateErrorV2("STREAM_INTERRUPTED", "Generation stream interrupted.");

        dispatch({
          type: "error",
          generationId: stateRef.current.generationId ?? "unknown",
          code: streamError.code,
          message: streamError.message
        });
        options.onError?.(streamError);
        throw streamError;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [abort, options]
  );

  return {
    state,
    spec: state.spec,
    isStreaming: state.isStreaming,
    rawEvents,
    send,
    clear,
    hydrate,
    abort
  };
}
