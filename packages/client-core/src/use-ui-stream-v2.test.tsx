import { act, create } from "react-test-renderer";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { UISpecV2 } from "@repo/contracts";
import { StreamGenerateErrorV2, streamGenerateV2 } from "./stream-v2";
import { useUIStreamV2, type UseUIStreamV2Result } from "./use-ui-stream-v2";

vi.mock("./stream-v2", async () => {
  const actual = await vi.importActual<typeof import("./stream-v2")>("./stream-v2");
  return {
    ...actual,
    streamGenerateV2: vi.fn()
  };
});

function renderHook(
  options: Parameters<typeof useUIStreamV2>[0]
): { read: () => UseUIStreamV2Result; unmount: () => void } {
  let current: UseUIStreamV2Result | null = null;
  let renderer: ReturnType<typeof create> | null = null;

  function Harness() {
    current = useUIStreamV2(options);
    return null;
  }

  act(() => {
    renderer = create(<Harness />);
  });

  return {
    read() {
      if (!current) {
        throw new Error("Hook has not rendered yet.");
      }
      return current;
    },
    unmount() {
      act(() => {
        renderer?.unmount();
      });
    }
  };
}

describe("useUIStreamV2", () => {
  beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates and clears the current spec", () => {
    const hook = renderHook({ endpoint: "/api/v2/generate" });
    const spec: UISpecV2 = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: {},
          children: []
        }
      },
      state: {}
    };

    act(() => {
      hook.read().hydrate(spec);
    });

    expect(hook.read().spec).toEqual(spec);

    act(() => {
      hook.read().clear();
    });

    expect(hook.read().spec).toBeNull();
    expect(hook.read().rawEvents).toEqual([]);
    hook.unmount();
  });

  it("streams events into state and calls onComplete with the final snapshot", async () => {
    const onComplete = vi.fn();
    vi.mocked(streamGenerateV2).mockImplementation(async ({ onEvent }) => {
      onEvent({
        type: "status",
        generationId: "g1",
        stage: "pass1_extract_components_v2"
      });
      onEvent({
        type: "patch",
        generationId: "g1",
        patch: {
          op: "add",
          path: "/elements/root",
          value: {
            type: "Card",
            props: {},
            children: []
          }
        }
      });
      onEvent({
        type: "done",
        generationId: "g1",
        versionId: "v1",
        specHash: "h1"
      });
    });

    const hook = renderHook({ endpoint: "/api/v2/generate", onComplete });

    await act(async () => {
      await hook.read().send({ threadId: "t1", prompt: "build", baseVersionId: null });
    });

    expect(vi.mocked(streamGenerateV2)).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/v2/generate",
        body: { threadId: "t1", prompt: "build", baseVersionId: null },
        signal: expect.any(AbortSignal),
        onEvent: expect.any(Function)
      })
    );
    expect(hook.read().rawEvents.map((event) => event.type)).toEqual(["status", "patch", "done"]);
    expect(hook.read().spec?.elements.root?.type).toBe("Card");
    expect(hook.read().isStreaming).toBe(false);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: "g1",
        spec: expect.objectContaining({
          elements: expect.objectContaining({
            root: expect.objectContaining({ type: "Card" })
          })
        })
      })
    );
    hook.unmount();
  });

  it("wraps unknown stream failures in a deterministic stream error", async () => {
    const onError = vi.fn();
    vi.mocked(streamGenerateV2).mockRejectedValue(new Error("network down"));

    const hook = renderHook({ endpoint: "/api/v2/generate", onError });
    let caught: unknown;

    await act(async () => {
      try {
        await hook.read().send({ threadId: "t1", prompt: "build", baseVersionId: null });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeInstanceOf(StreamGenerateErrorV2);
    expect((caught as StreamGenerateErrorV2).code).toBe("STREAM_INTERRUPTED");
    expect(hook.read().state.error).toEqual(
      expect.objectContaining({
        code: "STREAM_INTERRUPTED",
        message: "Generation stream interrupted."
      })
    );
    expect(onError).toHaveBeenCalledWith(expect.any(StreamGenerateErrorV2));
    hook.unmount();
  });
});
