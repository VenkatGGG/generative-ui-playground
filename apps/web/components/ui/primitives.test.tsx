import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Select } from "./select";
import { Separator } from "./separator";
import { Textarea } from "./textarea";

describe("ui primitives", () => {
  it("renders badge and button variants with caller classes", () => {
    const badge = renderToStaticMarkup(
      createElement(Badge, { variant: "secondary", className: "badge-extra" }, "Beta")
    );
    const button = renderToStaticMarkup(
      createElement(Button, { variant: "outline", size: "sm", className: "button-extra" }, "Launch")
    );

    expect(badge).toContain("Beta");
    expect(badge).toContain("bg-muted");
    expect(badge).toContain("badge-extra");

    expect(button).toContain("Launch");
    expect(button).toContain("border-border");
    expect(button).toContain("h-8");
    expect(button).toContain("button-extra");
    expect(button).toContain('type="button"');
  });

  it("renders card sections with the expected semantic wrappers", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Card,
        null,
        createElement(
          CardHeader,
          null,
          createElement(CardTitle, null, "Studio"),
          createElement(CardDescription, null, "Control panel")
        ),
        createElement(CardContent, null, "Body"),
        createElement(CardFooter, null, "Footer")
      )
    );

    expect(markup).toContain("rounded-lg");
    expect(markup).toContain("Studio");
    expect(markup).toContain("Control panel");
    expect(markup).toContain("Body");
    expect(markup).toContain("Footer");
  });

  it("renders form primitives with labels, options, and orientation", () => {
    const checkbox = renderToStaticMarkup(
      createElement(Checkbox, { label: "Email me updates", defaultChecked: true })
    );
    const input = renderToStaticMarkup(
      createElement(Input, { placeholder: "you@company.com", defaultValue: "sri@example.com" })
    );
    const select = renderToStaticMarkup(
      createElement(Select, {
        defaultValue: "pro",
        options: [
          { label: "Starter", value: "starter" },
          { label: "Pro", value: "pro" }
        ]
      })
    );
    const separator = renderToStaticMarkup(createElement(Separator, { orientation: "vertical" }));
    const textarea = renderToStaticMarkup(
      createElement(Textarea, { placeholder: "Tell us more", defaultValue: "A longer note" })
    );

    expect(checkbox).toContain("Email me updates");
    expect(checkbox).toContain('type="checkbox"');
    expect(checkbox).toContain("inline-flex");

    expect(input).toContain('placeholder="you@company.com"');
    expect(input).toContain('value="sri@example.com"');

    expect(select).toContain("<option");
    expect(select).toContain(">Starter</option>");
    expect(select).toContain('<option value="pro" selected="">Pro</option>');

    expect(separator).toContain('role="separator"');
    expect(separator).toContain('aria-orientation="vertical"');
    expect(separator).toContain("w-px");

    expect(textarea).toContain('placeholder="Tell us more"');
    expect(textarea).toContain("A longer note");
  });
});
