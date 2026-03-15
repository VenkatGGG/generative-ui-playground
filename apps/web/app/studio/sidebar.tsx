import React from "react";
import type { GenerationStateV2 } from "@repo/client-core/client";
import type { StreamEventV2, ThreadBundleV2, VersionRecordV2 } from "@repo/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  fallbackApplied,
  looksLikeJsonContent,
  type RevertState,
  statusFromState,
  type UiMessage,
  warningCount
} from "./helpers";

interface StudioSidebarProps {
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  state: GenerationStateV2;
  rawEvents: StreamEventV2[];
  messages: UiMessage[];
  versions: VersionRecordV2[];
  bundle: ThreadBundleV2 | null;
  revertState: RevertState;
  onRevert: (versionId: string) => void | Promise<void>;
  threadError: string | null;
}

export function StudioSidebar({
  prompt,
  setPrompt,
  onSubmit,
  state,
  rawEvents,
  messages,
  versions,
  bundle,
  revertState,
  onRevert,
  threadError
}: StudioSidebarProps) {
  const status = statusFromState(state);
  const statusVariant: "outline" | "secondary" | "destructive" =
    status === "streaming" ? "secondary" : status === "error" ? "destructive" : "outline";
  const latestEventType = rawEvents.length > 0 ? rawEvents[rawEvents.length - 1]?.type : null;
  const warningItems = state.warnings.slice(-4);

  return (
    <aside className="border-r bg-card/80 p-4 backdrop-blur">
      <div className="flex h-full flex-col gap-4">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Generative UI Studio</h1>
          <p className="text-sm text-muted-foreground">React-only iterative canvas</p>
        </header>

        <Card>
          <CardContent className="grid gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={statusVariant}>{status}</Badge>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">warnings: {state.warnings.length}</Badge>
              <Badge variant="outline">events: {rawEvents.length}</Badge>
              {state.usage ? <Badge variant="outline">tokens: {state.usage.totalTokens}</Badge> : null}
              {latestEventType ? <Badge variant="secondary">last: {latestEventType}</Badge> : null}
            </div>
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
          <CardContent className="max-h-52 space-y-2 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              messages.map((message) => (
                <div key={message.id} className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{message.role}:</span>
                    {message.role === "assistant" && fallbackApplied(message.meta) ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        fallback
                      </Badge>
                    ) : null}
                    {message.role === "assistant" && warningCount(message.meta) !== null ? (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        warnings {warningCount(message.meta)}
                      </Badge>
                    ) : null}
                  </div>
                  {message.role === "assistant" && looksLikeJsonContent(message.content) ? (
                    <pre className="max-h-48 overflow-auto break-words whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">
                      {message.content}
                    </pre>
                  ) : (
                    <p>{message.content}</p>
                  )}
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
            <CardTitle className="text-base">Generation Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {state.usage ? (
              <p className="text-xs text-muted-foreground">
                Usage: prompt {state.usage.promptTokens}, completion {state.usage.completionTokens}, total{" "}
                {state.usage.totalTokens}
                {state.usage.model ? ` (${state.usage.model})` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No usage data yet.</p>
            )}

            {warningItems.length > 0 ? (
              warningItems.map((warning, index) => (
                <div
                  key={`${warning.code}_${index}`}
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs"
                >
                  <p className="font-medium">{warning.code}</p>
                  <p className="text-muted-foreground">{warning.message}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No warnings.</p>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Versions</CardTitle>
          </CardHeader>
          <CardContent className="max-h-52 space-y-3 overflow-y-auto">
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

        {threadError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {threadError}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
