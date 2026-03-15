"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StreamGenerateErrorV2, useUIStreamV2 } from "@repo/client-core/client";
import type { ThreadBundleV2, UISpecV2, VersionRecordV2 } from "@repo/contracts";
import { DynamicRendererV2 } from "@repo/renderer-react";
import { cn } from "@/lib/utils";
import { findActiveSpec, type RevertState, type UiMessage } from "./studio/helpers";
import { studioRegistry } from "./studio/registry";
import { StudioSidebar } from "./studio/sidebar";

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [bundle, setBundle] = useState<ThreadBundleV2 | null>(null);
  const [hydratedSpec, setHydratedSpec] = useState<UISpecV2 | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [versions, setVersions] = useState<VersionRecordV2[]>([]);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [revertState, setRevertState] = useState<RevertState>({ versionId: null, loading: false });
  const {
    state,
    rawEvents,
    send: streamGenerate,
    hydrate
  } = useUIStreamV2({
    endpoint: "/api/v2/generate"
  });

  const refreshThread = useCallback(
    async (threadId: string) => {
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
          reasoning: message.reasoning,
          meta: message.meta
        }))
      );

      const activeSpec = findActiveSpec(nextBundle);
      setHydratedSpec(activeSpec);
      hydrate(activeSpec);
    },
    [hydrate]
  );

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
  }, [refreshThread]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = prompt.trim();

    if (!text || !bundle) {
      return;
    }

    setThreadError(null);
    hydrate(findActiveSpec(bundle));

    try {
      await streamGenerate({
        threadId: bundle.thread.threadId,
        prompt: text,
        baseVersionId: bundle.thread.activeVersionId
      });
      await refreshThread(bundle.thread.threadId);
      setPrompt("");
    } catch (error) {
      if (error instanceof StreamGenerateErrorV2 && error.code === "HTTP_ERROR" && error.status === 409) {
        await refreshThread(bundle.thread.threadId);
        setThreadError("Base version was stale. Thread state has been refreshed.");
        return;
      }

      setThreadError(error instanceof Error ? error.message : "Generation failed.");
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
        <StudioSidebar
          prompt={prompt}
          setPrompt={setPrompt}
          onSubmit={onSubmit}
          state={state}
          rawEvents={rawEvents}
          messages={messages}
          versions={versions}
          bundle={bundle}
          revertState={revertState}
          onRevert={onRevert}
          threadError={threadError}
        />

        <section className="p-6 lg:p-8">
          <div
            className={cn(
              "min-h-[calc(100vh-4rem)] overflow-auto rounded-xl border border-dashed border-border bg-muted/40 p-6"
            )}
          >
            <DynamicRendererV2 spec={displaySpec ?? null} registry={studioRegistry} />
          </div>
        </section>
      </div>
    </main>
  );
}
