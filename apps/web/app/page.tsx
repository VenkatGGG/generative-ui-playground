"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import {
  generationReducerV2,
  initialGenerationStateV2,
  streamGenerateV2,
  StreamGenerateErrorV2
} from "@repo/client-core";
import type { ThreadBundleV2, UISpecV2, VersionRecordV2 } from "@repo/contracts";
import {
  DynamicRendererV2,
  createStrictRegistryV2,
  type RegisteredComponentPropsV2
} from "@repo/renderer-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asSeparatorOrientation(value: unknown): "horizontal" | "vertical" {
  return value === "vertical" ? "vertical" : "horizontal";
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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

function asSelectOptions(value: unknown): SelectOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return { label: entry, value: entry } satisfies SelectOption;
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const label = (entry as Record<string, unknown>).label;
        const optionValue = (entry as Record<string, unknown>).value;
        if (typeof label === "string" && typeof optionValue === "string") {
          return { label, value: optionValue } satisfies SelectOption;
        }
      }
      return null;
    })
    .filter((entry): entry is SelectOption => entry !== null);
}

function asChangeHandler(value: unknown): React.ChangeEventHandler<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
> | undefined {
  return typeof value === "function"
    ? (value as React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>)
    : undefined;
}

function asClickHandler(value: unknown): React.MouseEventHandler<HTMLButtonElement> | undefined {
  return typeof value === "function" ? (value as React.MouseEventHandler<HTMLButtonElement>) : undefined;
}

function RegistryCard({ children, className }: RegisteredComponentPropsV2) {
  return <Card className={asString(className)}>{children}</Card>;
}

function RegistryCardHeader({ children, className }: RegisteredComponentPropsV2) {
  return <CardHeader className={asString(className)}>{children}</CardHeader>;
}

function RegistryCardTitle({ children, className }: RegisteredComponentPropsV2) {
  return <CardTitle className={asString(className)}>{children}</CardTitle>;
}

function RegistryCardDescription({ children, className }: RegisteredComponentPropsV2) {
  return <CardDescription className={asString(className)}>{children}</CardDescription>;
}

function RegistryCardContent({ children, className }: RegisteredComponentPropsV2) {
  return <CardContent className={asString(className)}>{children}</CardContent>;
}

function RegistryCardFooter({ children, className }: RegisteredComponentPropsV2) {
  return <CardFooter className={asString(className)}>{children}</CardFooter>;
}

function RegistryText({ text, children, className }: RegisteredComponentPropsV2) {
  const displayText =
    typeof text === "string" || typeof text === "number" || typeof text === "boolean"
      ? String(text)
      : children;
  return <span className={asString(className)}>{displayText}</span>;
}

function RegistryButton({ children, className, variant, size, onClick, type }: RegisteredComponentPropsV2) {
  return (
    <Button
      className={asString(className)}
      variant={asButtonVariant(variant)}
      size={asButtonSize(size)}
      onClick={asClickHandler(onClick)}
      type={asString(type) === "submit" ? "submit" : "button"}
    >
      {children}
    </Button>
  );
}

function RegistryBadge({ children, className, variant }: RegisteredComponentPropsV2) {
  return (
    <Badge className={asString(className)} variant={asBadgeVariant(variant)}>
      {children}
    </Badge>
  );
}

function RegistryInput({ className, placeholder, type, value, onChange }: RegisteredComponentPropsV2) {
  const resolvedOnChange = asChangeHandler(onChange);
  const resolvedValue = asString(value);
  return (
    <Input
      className={asString(className)}
      placeholder={asString(placeholder)}
      type={asString(type)}
      {...(resolvedOnChange
        ? {
            value: resolvedValue ?? "",
            onChange: resolvedOnChange
          }
        : {
            defaultValue: resolvedValue
          })}
    />
  );
}

function RegistryTextarea({
  className,
  placeholder,
  value,
  rows,
  onChange
}: RegisteredComponentPropsV2) {
  const resolvedOnChange = asChangeHandler(onChange);
  const resolvedValue = asString(value);
  return (
    <Textarea
      className={asString(className)}
      placeholder={asString(placeholder)}
      rows={asNumber(rows)}
      {...(resolvedOnChange
        ? {
            value: resolvedValue ?? "",
            onChange: resolvedOnChange
          }
        : {
            defaultValue: resolvedValue
          })}
    />
  );
}

function RegistrySeparator({ className, orientation }: RegisteredComponentPropsV2) {
  return (
    <Separator
      className={asString(className)}
      orientation={asSeparatorOrientation(orientation)}
    />
  );
}

function RegistryCheckbox({ className, checked, label, onChange }: RegisteredComponentPropsV2) {
  const resolvedOnChange = asChangeHandler(onChange);
  const resolvedChecked = asBoolean(checked);
  return (
    <Checkbox
      className={asString(className)}
      label={asString(label)}
      {...(resolvedOnChange
        ? {
            checked: resolvedChecked ?? false,
            onChange: resolvedOnChange
          }
        : {
            defaultChecked: resolvedChecked
          })}
    />
  );
}

function RegistrySelect({ className, options, value, onChange }: RegisteredComponentPropsV2) {
  const resolvedOnChange = asChangeHandler(onChange);
  const resolvedValue = asString(value);
  return (
    <Select
      className={asString(className)}
      options={asSelectOptions(options)}
      {...(resolvedOnChange
        ? {
            value: resolvedValue ?? "",
            onChange: resolvedOnChange
          }
        : {
            defaultValue: resolvedValue
          })}
    />
  );
}

function RegistryStack({ children, className, direction, gap }: RegisteredComponentPropsV2) {
  const directionClass = direction === "horizontal" ? "flex-row" : "flex-col";
  const gapClass = typeof gap === "string" ? gap : "gap-2";
  return <div className={cn("flex", directionClass, gapClass, asString(className))}>{children}</div>;
}

const registry = createStrictRegistryV2({
  Card: RegistryCard,
  CardHeader: RegistryCardHeader,
  CardTitle: RegistryCardTitle,
  CardDescription: RegistryCardDescription,
  CardContent: RegistryCardContent,
  CardFooter: RegistryCardFooter,
  Button: RegistryButton,
  Badge: RegistryBadge,
  Text: RegistryText,
  Input: RegistryInput,
  Textarea: RegistryTextarea,
  Separator: RegistrySeparator,
  Checkbox: RegistryCheckbox,
  Select: RegistrySelect,
  Stack: RegistryStack
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

function findActiveSpec(bundle: ThreadBundleV2): UISpecV2 | null {
  const activeId = bundle.thread.activeVersionId;
  const active = bundle.versions.find((version) => version.versionId === activeId) ?? bundle.versions[0];
  return active?.specSnapshot ?? null;
}

function statusFromState(state: ReturnType<typeof generationReducerV2>): "idle" | "streaming" | "error" {
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
  const [bundle, setBundle] = useState<ThreadBundleV2 | null>(null);
  const [hydratedSpec, setHydratedSpec] = useState<UISpecV2 | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [versions, setVersions] = useState<VersionRecordV2[]>([]);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [revertState, setRevertState] = useState<RevertState>({ versionId: null, loading: false });
  const [state, dispatch] = useReducer(generationReducerV2, initialGenerationStateV2);

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
    const response = await fetch(`/api/v2/threads/${threadId}`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Failed to load thread (${response.status})`);
    }

    const nextBundle = (await response.json()) as ThreadBundleV2;
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
    setHydratedSpec(activeSpec);
    dispatch({ type: "hydrate", spec: activeSpec });
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const create = await fetch("/api/v2/threads", {
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
    dispatch({ type: "hydrate", spec: findActiveSpec(bundle) });

    try {
      await streamGenerateV2({
        endpoint: "/api/v2/generate",
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
        error instanceof StreamGenerateErrorV2 &&
        error.code === "HTTP_ERROR" &&
        error.status === 409
      ) {
        await refreshThread(bundle.thread.threadId);
        setThreadError("Base version was stale. Thread state has been refreshed.");
        return;
      }

      if (error instanceof StreamGenerateErrorV2 && error.code === "STREAM_INTERRUPTED") {
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
      const response = await fetch(`/api/v2/threads/${bundle.thread.threadId}/revert`, {
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
            <DynamicRendererV2 spec={displaySpec ?? null} registry={registry} />
          </div>
        </section>
      </div>
    </main>
  );
}
