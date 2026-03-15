import { createElement } from "react";
import { describe, expect, it } from "vitest";
import RootLayout, { metadata } from "./layout";

describe("RootLayout", () => {
  it("exports the expected metadata", () => {
    expect(metadata).toEqual({
      title: "Generative UI Playground",
      description: "React-only generative UI platform"
    });
  });

  it("wraps children in an html/body shell", () => {
    const tree = RootLayout({ children: createElement("main", null, "Studio") });

    expect(tree.type).toBe("html");
    expect(tree.props.lang).toBe("en");

    const body = tree.props.children;
    expect(body.type).toBe("body");

    const child = body.props.children;
    expect(child.type).toBe("main");
    expect(child.props.children).toBe("Studio");
  });
});
