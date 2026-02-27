"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import {
  generationReducer,
  initialGenerationState,
  streamGenerate,
  StreamGenerateError
} from "@repo/client-core";
import type { ThreadBundle, UISpec, VersionRecord } from "@repo/contracts";
import { DynamicRenderer, createStrictRegistry, type RegisteredComponentProps } from "@repo/renderer-react";

function Card({ children, className }: RegisteredComponentProps) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "white",
        padding: 16,
        boxShadow: "0 1px 2px rgba(2,6,23,0.08)"
      }}
      className={typeof className === "string" ? className : undefined}
    >
      {children}
    </div>
  );
}

function CardHeader({ children }: RegisteredComponentProps) {
  return <div style={{ marginBottom: 12 }}>{children}</div>;
}

function CardTitle({ children }: RegisteredComponentProps) {
  return <h3 style={{ margin: 0, fontSize: 20 }}>{children}</h3>;
}

function CardDescription({ children }: RegisteredComponentProps) {
  return <p style={{ margin: "6px 0 0", color: "#475569" }}>{children}</p>;
}

function CardContent({ children }: RegisteredComponentProps) {
  return <div>{children}</div>;
}

function Text({ text }: RegisteredComponentProps) {
  return <span>{typeof text === "string" ? text : ""}</span>;
}

function Button({ children }: RegisteredComponentProps) {
  return (
    <button
      type="button"
      style={{
        background: "var(--accent)",
        color: "white",
        border: 0,
        borderRadius: 8,
        padding: "10px 14px",
        fontWeight: 600,
        cursor: "pointer"
      }}
    >
      {children}
    </button>
  );
}

const registry = createStrictRegistry({
  Card: Card as any,
  CardHeader: CardHeader as any,
  CardTitle: CardTitle as any,
  CardDescription: CardDescription as any,
  CardContent: CardContent as any,
  Button: Button as any,
  Text: Text as any
});

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type RevertState = {
  versionId: string | null;
  loading: boolean;
};

function findActiveSpec(bundle: ThreadBundle): UISpec | null {
  const activeId = bundle.thread.activeVersionId;
  const active = bundle.versions.find((version) => version.versionId === activeId) ?? bundle.versions[0];
  return active?.specSnapshot ?? null;
}

function statusFromState(state: ReturnType<typeof generationReducer>): "idle" | "streaming" | "error" {
  if (state.error) {
    return "error";
  }
  if (state.isStreaming) {
    return "streaming";
  }
  return "idle";
}

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [bundle, setBundle] = useState<ThreadBundle | null>(null);
  const [hydratedSpec, setHydratedSpec] = useState<UISpec | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [revertState, setRevertState] = useState<RevertState>({ versionId: null, loading: false });
  const [state, dispatch] = useReducer(generationReducer, initialGenerationState);

  const status = statusFromState(state);

  const statusColor = useMemo(() => {
    switch (status) {
      case "streaming":
        return "#0369a1";
      case "error":
        return "#b91c1c";
      default:
        return "#334155";
    }
  }, [status]);

  const refreshThread = async (threadId: string) => {
    const response = await fetch(`/api/threads/${threadId}`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Failed to load thread (${response.status})`);
    }

    const nextBundle = (await response.json()) as ThreadBundle;
    setBundle(nextBundle);
    setVersions(nextBundle.versions);
    setMessages(
      nextBundle.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content
      }))
    );

    const activeSpec = findActiveSpec(nextBundle);
    if (activeSpec) {
      setHydratedSpec(activeSpec);
    }
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const create = await fetch("/api/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Studio Session" })
        });

        if (!create.ok) {
          throw new Error(`Thread creation failed (${create.status})`);
        }

        const created = (await create.json()) as { thread: { threadId: string } };
        if (!mounted) {
          return;
        }

        await refreshThread(created.thread.threadId);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setThreadError(error instanceof Error ? error.message : "Failed to bootstrap thread.");
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = prompt.trim();

    if (!text || !bundle) {
      return;
    }

    setThreadError(null);

    try {
      await streamGenerate({
        endpoint: "/api/generate",
        body: {
          threadId: bundle.thread.threadId,
          prompt: text,
          baseVersionId: bundle.thread.activeVersionId
        },
        onEvent: (incomingEvent) => {
          try {
            dispatch(incomingEvent);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Could not apply streamed patch update.";

            dispatch({
              type: "error",
              generationId: incomingEvent.generationId,
              code: "PATCH_APPLY_FAILED",
              message
            });

            throw new Error(`PATCH_APPLY_FAILED:${message}`);
          }

          if (incomingEvent.type === "done") {
            void refreshThread(bundle.thread.threadId);
          }
        }
      });
      setPrompt("");
    } catch (error) {
      if (
        error instanceof StreamGenerateError &&
        error.code === "HTTP_ERROR" &&
        error.status === 409
      ) {
        await refreshThread(bundle.thread.threadId);
        setThreadError("Base version was stale. Thread state has been refreshed.");
        return;
      }

      if (error instanceof StreamGenerateError && error.code === "STREAM_INTERRUPTED") {
        dispatch({
          type: "error",
          generationId: state.generationId ?? "unknown",
          code: "STREAM_INTERRUPTED",
          message: error.message
        });
      }

      const message = error instanceof Error ? error.message : "Generation failed.";
      setThreadError(message.replace(/^PATCH_APPLY_FAILED:/, "Patch apply failed: "));
    }
  };

  const onRevert = async (versionId: string) => {
    if (!bundle) {
      return;
    }

    setRevertState({ versionId, loading: true });
    setThreadError(null);

    try {
      const response = await fetch(`/api/threads/${bundle.thread.threadId}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId })
      });

      if (!response.ok) {
        throw new Error(`Revert failed (${response.status})`);
      }

      await refreshThread(bundle.thread.threadId);
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : "Revert failed.");
    } finally {
      setRevertState({ versionId: null, loading: false });
    }
  };

  const displaySpec = state.spec ?? hydratedSpec ?? (bundle ? findActiveSpec(bundle) : null);

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "340px 1fr",
        minHeight: "100vh"
      }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          background: "white",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16
        }}
      >
        <header>
          <h1 style={{ margin: 0, fontSize: 20 }}>Generative UI Studio</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
            React-only iterative canvas
          </p>
        </header>

        <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
          <strong style={{ fontSize: 13 }}>Status:</strong>{" "}
          <span style={{ color: statusColor }}>{status}</span>
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 8 }}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe changes..."
            rows={5}
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 10,
              resize: "vertical"
            }}
          />
          <button
            type="submit"
            disabled={!bundle || state.isStreaming}
            style={{
              border: 0,
              borderRadius: 10,
              padding: "10px 14px",
              background: !bundle || state.isStreaming ? "#94a3b8" : "var(--accent)",
              color: "white",
              fontWeight: 600,
              cursor: !bundle || state.isStreaming ? "not-allowed" : "pointer"
            }}
          >
            {state.isStreaming ? "Generating..." : "Send Prompt"}
          </button>
        </form>

        <section style={{ minHeight: 0, display: "grid", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Conversation</h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, maxHeight: 200, overflow: "auto" }}>
            {messages.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No messages yet.</p>
            ) : (
              messages.map((message) => (
                <p key={message.id} style={{ margin: "0 0 8px", fontSize: 13 }}>
                  <strong>{message.role}:</strong> {message.content}
                </p>
              ))
            )}
          </div>
        </section>

        <section style={{ minHeight: 0, display: "grid", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Versions</h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, maxHeight: 180, overflow: "auto" }}>
            {versions.map((version) => {
              const active = bundle?.thread.activeVersionId === version.versionId;

              return (
                <div key={version.versionId} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{version.versionId.slice(0, 8)}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                    {new Date(version.createdAt).toLocaleString()}
                  </div>
                  <button
                    type="button"
                    disabled={active || revertState.loading}
                    onClick={() => void onRevert(version.versionId)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "5px 9px",
                      fontSize: 12,
                      background: active ? "#e2e8f0" : "white",
                      cursor: active || revertState.loading ? "not-allowed" : "pointer"
                    }}
                  >
                    {active
                      ? "Active"
                      : revertState.loading && revertState.versionId === version.versionId
                        ? "Reverting..."
                        : "Revert"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {threadError && (
          <div style={{ color: "#b91c1c", fontSize: 13 }}>
            {threadError}
          </div>
        )}
      </aside>

      <section style={{ padding: 28 }}>
        <div
          style={{
            border: "1px dashed #94a3b8",
            borderRadius: 14,
            minHeight: "calc(100vh - 56px)",
            padding: 20,
            background: "#f1f5f9"
          }}
        >
          <DynamicRenderer spec={displaySpec ?? null} registry={registry} />
        </div>
      </section>
    </main>
  );
}
