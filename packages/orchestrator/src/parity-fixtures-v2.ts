import type { StreamEventV2 } from "@repo/contracts";

export interface ParityFixtureV2 {
  id: "pricing" | "form" | "dashboard";
  prompt: string;
  expectedTerminalSequence: Array<StreamEventV2["type"]>;
}

export const PARITY_FIXTURES_V2: ReadonlyArray<ParityFixtureV2> = [
  {
    id: "pricing",
    prompt:
      "Create a pricing card for Pro plan with title, description, $29/mo, three features, primary and secondary CTA.",
    expectedTerminalSequence: ["status", "patch", "usage", "done"]
  },
  {
    id: "form",
    prompt:
      "Create a contact form with name/email/message, checkbox consent, and submit button using proper form state bindings.",
    expectedTerminalSequence: ["status", "patch", "usage", "done"]
  },
  {
    id: "dashboard",
    prompt:
      "Create a compact KPI dashboard with headline, three metric rows, and one refresh action.",
    expectedTerminalSequence: ["status", "patch", "usage", "done"]
  }
];
