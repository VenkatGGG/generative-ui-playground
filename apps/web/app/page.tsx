"use client";

import { useMemo, useState } from "react";
import type { UISpec } from "@repo/contracts";
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

const starterSpec: UISpec = {
  root: "root",
  elements: {
    root: { type: "Card", props: {}, children: ["header", "content"] },
    header: { type: "CardHeader", props: {}, children: ["title", "desc"] },
    title: { type: "CardTitle", props: {}, children: ["title_text"] },
    title_text: { type: "Text", props: { text: "Generative UI Studio" }, children: [] },
    desc: { type: "CardDescription", props: {}, children: ["desc_text"] },
    desc_text: { type: "Text", props: { text: "Submit prompts to iteratively mutate this canvas." }, children: [] },
    content: { type: "CardContent", props: {}, children: ["cta"] },
    cta: { type: "Button", props: {}, children: ["cta_text"] },
    cta_text: { type: "Text", props: { text: "Awaiting generation" }, children: [] }
  }
};

type StudioStatus = "idle" | "streaming" | "error";

type VersionItem = { id: string; label: string; createdAt: string };

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<StudioStatus>("idle");
  const [messages, setMessages] = useState<Array<{ role: "user" | "system"; content: string }>>([
    { role: "system", content: "Thread initialized." }
  ]);
  const [spec, setSpec] = useState<UISpec>(starterSpec);
  const [versions, setVersions] = useState<VersionItem[]>([
    { id: "v1", label: "Initial state", createdAt: new Date().toISOString() }
  ]);

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

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text) {
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setStatus("streaming");

    // Temporary placeholder lifecycle until API wiring lands.
    setTimeout(() => {
      setStatus("idle");
      setVersions((prev) => [
        {
          id: `v${prev.length + 1}`,
          label: `Prompt: ${text.slice(0, 24)}`,
          createdAt: new Date().toISOString()
        },
        ...prev
      ]);
      setMessages((prev) => [...prev, { role: "system", content: "Generation pipeline not yet connected." }]);
      setSpec((prev) => ({ ...prev }));
    }, 350);

    setPrompt("");
  };

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
            style={{
              border: 0,
              borderRadius: 10,
              padding: "10px 14px",
              background: "var(--accent)",
              color: "white",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Send Prompt
          </button>
        </form>

        <section style={{ minHeight: 0, display: "grid", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Conversation</h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, maxHeight: 200, overflow: "auto" }}>
            {messages.map((message, index) => (
              <p key={`${message.role}-${index}`} style={{ margin: "0 0 8px", fontSize: 13 }}>
                <strong>{message.role}:</strong> {message.content}
              </p>
            ))}
          </div>
        </section>

        <section style={{ minHeight: 0, display: "grid", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Versions</h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, maxHeight: 180, overflow: "auto" }}>
            {versions.map((version) => (
              <div key={version.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{version.id}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{version.label}</div>
              </div>
            ))}
          </div>
        </section>
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
          <DynamicRenderer spec={spec} registry={registry} />
        </div>
      </section>
    </main>
  );
}
