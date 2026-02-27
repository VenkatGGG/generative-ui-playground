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
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asButtonVariant(value: unknown): ButtonProps["variant"] | undefined {
  if (value === "default" || value === "outline" || value === "secondary" || value === "destructive") {
    return value;
  }
  return undefined;
}

function asButtonSize(value: unknown): ButtonProps["size"] | undefined {
  if (value === "default" || value === "sm" || value === "lg") {
    return value;
  }
  return undefined;
}

function asBadgeVariant(value: unknown): BadgeProps["variant"] | undefined {
  if (value === "default" || value === "outline" || value === "secondary" || value === "destructive") {
    return value;
  }
  return undefined;
}

function RegistryCard({ children, className }: RegisteredComponentProps) {
  return <Card className={asString(className)}>{children}</Card>;
}

function RegistryCardHeader({ children, className }: RegisteredComponentProps) {
  return <CardHeader className={asString(className)}>{children}</CardHeader>;
}

function RegistryCardTitle({ children, className }: RegisteredComponentProps) {
  return <CardTitle className={asString(className)}>{children}</CardTitle>;
}

function RegistryCardDescription({ children, className }: RegisteredComponentProps) {
  return <CardDescription className={asString(className)}>{children}</CardDescription>;
}

function RegistryCardContent({ children, className }: RegisteredComponentProps) {
  return <CardContent className={asString(className)}>{children}</CardContent>;
}

function RegistryText({ text, children, className }: RegisteredComponentProps) {
  return <span className={asString(className)}>{typeof text === "string" ? text : children}</span>;
}

function RegistryButton({ children, className, variant, size }: RegisteredComponentProps) {
  return (
    <Button className={asString(className)} variant={asButtonVariant(variant)} size={asButtonSize(size)}>
      {children}
    </Button>
  );
}

function RegistryBadge({ children, className, variant }: RegisteredComponentProps) {
  return (
    <Badge className={asString(className)} variant={asBadgeVariant(variant)}>
      {children}
    </Badge>
  );
}

const registry = createStrictRegistry({
  Card: RegistryCard,
  CardHeader: RegistryCardHeader,
  CardTitle: RegistryCardTitle,
  CardDescription: RegistryCardDescription,
  CardContent: RegistryCardContent,
  Button: RegistryButton,
  Badge: RegistryBadge,
  Text: RegistryText
});

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
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
  const statusVariant = useMemo<"outline" | "secondary" | "destructive">(() => {
    switch (status) {
      case "streaming":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
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
        content: message.content,
        reasoning: message.reasoning
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
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r bg-card/80 p-4 backdrop-blur">
          <div className="flex h-full flex-col gap-4">
            <header className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">Generative UI Studio</h1>
              <p className="text-sm text-muted-foreground">React-only iterative canvas</p>
            </header>

            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <span className="text-sm font-medium">Status</span>
                <Badge variant={statusVariant}>{status}</Badge>
              </CardContent>
            </Card>

            <form onSubmit={onSubmit} className="grid gap-2">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe changes..."
                rows={5}
                className="resize-y"
              />
              <Button type="submit" disabled={!bundle || state.isStreaming}>
                {state.isStreaming ? "Generating..." : "Send Prompt"}
              </Button>
            </form>

            <Card className="min-h-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Conversation</CardTitle>
              </CardHeader>
              <CardContent className="max-h-52 overflow-y-auto space-y-2">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="space-y-1 text-sm">
                      <p>
                        <span className="font-semibold">{message.role}:</span> {message.content}
                      </p>
                      {message.role === "assistant" && message.reasoning ? (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">reasoning:</span> {message.reasoning}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="min-h-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Versions</CardTitle>
              </CardHeader>
              <CardContent className="max-h-52 overflow-y-auto space-y-3">
                {versions.map((version) => {
                  const active = bundle?.thread.activeVersionId === version.versionId;

                  return (
                    <div key={version.versionId} className="rounded-md border border-border p-3">
                      <p className="text-sm font-semibold">{version.versionId.slice(0, 8)}</p>
                      <p className="mb-2 text-xs text-muted-foreground">
                        {new Date(version.createdAt).toLocaleString()}
                      </p>
                      <Button
                        size="sm"
                        variant={active ? "secondary" : "outline"}
                        disabled={active || revertState.loading}
                        onClick={() => void onRevert(version.versionId)}
                      >
                        {active
                          ? "Active"
                          : revertState.loading && revertState.versionId === version.versionId
                            ? "Reverting..."
                            : "Revert"}
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {threadError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {threadError}
              </div>
            )}
          </div>
        </aside>

        <section className="p-6 lg:p-8">
          <div
            className={cn(
              "min-h-[calc(100vh-4rem)] rounded-xl border border-dashed border-border bg-muted/40 p-6",
              "overflow-auto"
            )}
          >
            <DynamicRenderer spec={displaySpec ?? null} registry={registry} />
          </div>
        </section>
      </div>
    </main>
  );
}
