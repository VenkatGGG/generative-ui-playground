import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the studio shell before thread bootstrap completes", () => {
    const markup = renderToStaticMarkup(createElement(HomePage));

    expect(markup).toContain("Generative UI Studio");
    expect(markup).toContain("React-only iterative canvas");
    expect(markup).toContain("Status");
    expect(markup).toContain("idle");
    expect(markup).toContain("Describe changes...");
    expect(markup).toContain("Send Prompt");
    expect(markup).toContain("Conversation");
    expect(markup).toContain("No messages yet.");
    expect(markup).toContain("Generation Diagnostics");
    expect(markup).toContain("No usage data yet.");
    expect(markup).toContain("No warnings.");
    expect(markup).toContain("Versions");
  });
});
