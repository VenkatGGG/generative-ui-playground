import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UISpec } from "@repo/contracts";
import { DynamicRenderer } from "./renderer";

const Card = ({ children }: { children?: React.ReactNode }) => <section>{children}</section>;
const Text = ({ text }: { text?: string }) => <p>{text}</p>;

describe("DynamicRenderer", () => {
  it("renders known components recursively", () => {
    const spec: UISpec = {
      root: "root",
      elements: {
        root: { type: "Card", props: {}, children: ["txt"] },
        txt: { type: "Text", props: { text: "Hello" }, children: [] }
      }
    };

    const html = renderToStaticMarkup(
      <DynamicRenderer
        spec={spec}
        registry={{
          Card: Card as any,
          Text: Text as any
        }}
      />
    );

    expect(html).toContain("Hello");
  });

  it("falls back for unknown components", () => {
    const spec: UISpec = {
      root: "root",
      elements: {
        root: { type: "Card", props: {}, children: [] }
      }
    };

    const html = renderToStaticMarkup(<DynamicRenderer spec={spec} registry={{}} />);

    expect(html).toContain("Unknown component: Card");
  });
});
