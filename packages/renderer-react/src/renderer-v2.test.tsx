import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UISpecV2 } from "@repo/contracts";
import { DynamicRendererV2 } from "./renderer-v2";

const Card = ({ children }: { children?: React.ReactNode }) => <section>{children}</section>;
const Text = ({ text }: { text?: string }) => <p>{text}</p>;
const Stack = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;

describe("DynamicRendererV2", () => {
  it("renders repeated content with dynamic item bindings", () => {
    const spec: UISpecV2 = {
      root: "root",
      state: {
        features: [{ label: "Team seats" }, { label: "Priority support" }]
      },
      elements: {
        root: { type: "Card", props: {}, children: ["list"] },
        list: {
          type: "Stack",
          props: {},
          children: ["featureText"],
          repeat: {
            statePath: "/features"
          }
        },
        featureText: {
          type: "Text",
          props: {
            text: { $item: "label" }
          },
          children: []
        }
      }
    };

    const html = renderToStaticMarkup(
      <DynamicRendererV2
        spec={spec}
        registry={{
          Card: Card as never,
          Stack: Stack as never,
          Text: Text as never
        }}
      />
    );

    expect(html).toContain("Team seats");
    expect(html).toContain("Priority support");
  });

  it("hides nodes when visible condition is false", () => {
    const spec: UISpecV2 = {
      root: "root",
      state: {
        show: false
      },
      elements: {
        root: {
          type: "Card",
          props: {},
          children: ["text"]
        },
        text: {
          type: "Text",
          props: {
            text: "Hidden text"
          },
          visible: {
            $state: "/show",
            eq: true
          },
          children: []
        }
      }
    };

    const html = renderToStaticMarkup(
      <DynamicRendererV2
        spec={spec}
        registry={{
          Card: Card as never,
          Text: Text as never
        }}
      />
    );

    expect(html).not.toContain("Hidden text");
  });

  it("does not crash on malformed visibility payloads", () => {
    const spec: UISpecV2 = {
      root: "root",
      state: {},
      elements: {
        root: {
          type: "Card",
          props: {},
          children: ["text"]
        },
        text: {
          type: "Text",
          props: {
            text: "Visible despite malformed visibility"
          },
          visible: null as unknown as never,
          children: []
        }
      }
    };

    const html = renderToStaticMarkup(
      <DynamicRendererV2
        spec={spec}
        registry={{
          Card: Card as never,
          Text: Text as never
        }}
      />
    );

    expect(html).toContain("Visible despite malformed visibility");
  });
});
