import { createHash, randomUUID } from "node:crypto";
import {
  UIComponentNodeSchema,
  type GenerateRequest,
  type StreamEvent,
  type UIComponentNode,
  type UISpec
} from "@repo/contracts";
import { normalizeTreeToSpec, validateSpec, diffSpecs } from "@repo/spec-engine";
import type { GenerationModelAdapter, MCPAdapter } from "@repo/integrations";
import type { PersistenceAdapter } from "@repo/persistence";
import { extractCompleteJsonObjects } from "./json-stream";
import {
  buildConstraintSet,
  canonicalizeNodeTypes,
  validateConstraintSet,
  type ConstraintViolation
} from "./constraints";

export interface OrchestratorDeps {
  model: GenerationModelAdapter;
  mcp: MCPAdapter;
  persistence: PersistenceAdapter;
}

function specHash(spec: UISpec): string {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

function parseCandidateObject(input: string): UIComponentNode | null {
  try {
    const parsed = JSON.parse(input);
    const validated = UIComponentNodeSchema.safeParse(parsed);
    if (!validated.success) {
      return null;
    }

    return canonicalizeNodeTypes(validated.data as UIComponentNode);
  } catch {
    return null;
  }
}

const fatalValidationCodes = new Set(["MAX_DEPTH_EXCEEDED", "MAX_NODES_EXCEEDED"]);
const MAX_PASS2_ATTEMPTS = 3;
const QUOTED_TOKEN_RE = /["“”'‘’]([^"“”'‘’]{2,80})["“”'‘’]/g;
const PRICE_TOKEN_RE = /\$\s?\d+(?:\.\d+)?(?:\s*\/\s*[a-zA-Z]+)?/;
const PRIMARY_CTA_HINT_RE =
  /\b(start|trial|subscribe|buy|get|continue|sign|join|upgrade|book)\b/i;
const SECONDARY_CTA_HINT_RE = /\b(view|docs|learn|more|details|read)\b/i;
const FEATURE_COUNT_RE = /(\d+)\s+bullet/i;
const DEFAULT_FEATURES = [
  "Unlimited projects",
  "Priority support",
  "Team collaboration",
  "Advanced analytics",
  "Custom workflows",
  "Export-ready reporting"
];

function summarizePrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 120) {
    return trimmed;
  }

  return `${trimmed.slice(0, 117)}...`;
}

function buildAssistantReasoningText(input: {
  prompt: string;
  intentType: "new" | "modify";
  confidence: number;
  componentNames: string[];
  mcpContextVersion: string;
  mcpRuleCount: number;
  patchCount: number;
  warningCount: number;
  finalElementCount: number;
}): string {
  const action = input.intentType === "modify" ? "Refined an existing UI" : "Generated a new UI";
  const components =
    input.componentNames.length > 0 ? input.componentNames.join(", ") : "none explicitly requested";
  const warnings =
    input.warningCount === 0
      ? "Validation completed with no warnings."
      : `Validation raised ${input.warningCount} warning(s).`;

  return [
    `${action} from prompt "${summarizePrompt(input.prompt)}".`,
    `Intent confidence: ${input.confidence.toFixed(2)}.`,
    `Target components: ${components}.`,
    `MCP context ${input.mcpContextVersion} supplied ${input.mcpRuleCount} rule(s).`,
    `Applied ${input.patchCount} patch(es); final spec has ${input.finalElementCount} element(s).`,
    warnings
  ].join(" ");
}

function buildRetryPrompt(basePrompt: string, violations: ConstraintViolation[], attempt: number): string {
  if (violations.length === 0) {
    return basePrompt;
  }

  const lines = violations.map((violation) => `- ${violation.message}`);

  return [
    basePrompt,
    "",
    `Retry attempt ${attempt}. You must satisfy ALL requirements below:`,
    ...lines,
    "Return complete UIComponentNode JSON snapshots only."
  ].join("\n");
}

function normalizeTextToken(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeTextToken).filter((value) => value.length > 0)));
}

function extractQuotedTokens(prompt: string): string[] {
  const tokens: string[] = [];
  for (const match of prompt.matchAll(QUOTED_TOKEN_RE)) {
    const token = match[1];
    if (!token) {
      continue;
    }
    tokens.push(token);
  }

  return uniqueStrings(tokens);
}

function derivePromptHints(prompt: string, requiredTextTokens: string[]): {
  title: string;
  description: string;
  price: string | null;
  primaryCta: string;
  secondaryCta: string;
  featureCount: number;
} {
  const quotedTokens = extractQuotedTokens(prompt);
  const combinedTokens = uniqueStrings([...quotedTokens, ...requiredTextTokens]);
  const lowerPrompt = prompt.toLowerCase();

  const priceToken =
    combinedTokens.find((token) => PRICE_TOKEN_RE.test(token)) ?? prompt.match(PRICE_TOKEN_RE)?.[0] ?? null;

  const primaryCta =
    combinedTokens.find((token) => PRIMARY_CTA_HINT_RE.test(token)) ??
    (lowerPrompt.includes("trial") ? "Start Free Trial" : "Get Started");

  const secondaryCta =
    combinedTokens.find((token) => token !== primaryCta && SECONDARY_CTA_HINT_RE.test(token)) ??
    (lowerPrompt.includes("docs") || lowerPrompt.includes("secondary") ? "View Docs" : "Learn More");

  const title =
    combinedTokens.find((token) => {
      if (token === priceToken || token === primaryCta || token === secondaryCta) {
        return false;
      }
      return token.length > 2;
    }) ?? (lowerPrompt.includes("pricing") ? "Pricing Plan" : "Generated UI");

  const descriptionToken = combinedTokens.find(
    (token) =>
      token !== title &&
      token !== priceToken &&
      token !== primaryCta &&
      token !== secondaryCta &&
      token.split(" ").length >= 3
  );
  const description =
    descriptionToken ??
    (lowerPrompt.includes("startup")
      ? "Perfect for startups and small teams."
      : "Clean, modern layout with clear hierarchy.");

  const featureCountMatch = prompt.match(FEATURE_COUNT_RE);
  const rawFeatureCount = featureCountMatch ? Number.parseInt(featureCountMatch[1] ?? "0", 10) : 0;
  const featureCount = Number.isFinite(rawFeatureCount) && rawFeatureCount > 0
    ? Math.min(rawFeatureCount, 6)
    : lowerPrompt.includes("feature")
      ? 3
      : 2;

  return {
    title,
    description,
    price: priceToken,
    primaryCta,
    secondaryCta,
    featureCount
  };
}

function buildDeterministicCardNode(input: {
  prompt: string;
  requiredTextTokens: string[];
  requiredComponentTypes: Set<string>;
  sourceTexts?: string[];
}): UIComponentNode {
  const hints = derivePromptHints(input.prompt, input.requiredTextTokens);
  const sourceTexts = uniqueStrings(input.sourceTexts ?? []);

  const usedTexts = new Set<string>();
  const track = (value: string): string => {
    usedTexts.add(normalizeTextToken(value).toLowerCase());
    return value;
  };

  const cardClassParts = ["w-full", "max-w-xl", "rounded-xl", "border", "p-1"];
  if (/\bshadow\b/i.test(input.prompt)) {
    cardClassParts.push("shadow-sm");
  }
  cardClassParts.push("bg-card");

  let idCounter = 0;
  const nextId = (prefix: string): string => {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
  };

  const contentChildren: UIComponentNode[] = [];

  if (hints.price) {
    contentChildren.push({
      id: nextId("price"),
      type: "Text",
      props: { className: "text-3xl font-bold tracking-tight" },
      children: [track(hints.price)]
    });
  }

  const candidateFeatures = sourceTexts.filter((text) => {
    const normalized = text.toLowerCase();
    return (
      normalized !== hints.title.toLowerCase() &&
      normalized !== hints.description.toLowerCase() &&
      normalized !== hints.primaryCta.toLowerCase() &&
      normalized !== hints.secondaryCta.toLowerCase() &&
      (!hints.price || normalized !== hints.price.toLowerCase())
    );
  });

  const featureValues = [...candidateFeatures, ...DEFAULT_FEATURES]
    .map((value) => (value.startsWith("•") ? value : `• ${value}`))
    .slice(0, hints.featureCount);

  featureValues.forEach((feature) => {
    contentChildren.push({
      id: nextId("feature"),
      type: "Text",
      props: { className: "text-sm text-muted-foreground" },
      children: [track(feature)]
    });
  });

  if (input.requiredComponentTypes.has("Badge") || /\bbadge|popular|pro plan\b/i.test(input.prompt)) {
    contentChildren.push({
      id: nextId("badge"),
      type: "Badge",
      props: { variant: "secondary" },
      children: [track("Popular")]
    });
  }

  contentChildren.push({
    id: nextId("primary-cta"),
    type: "Button",
    props: { className: "w-full", variant: "default" },
    children: [track(hints.primaryCta)]
  });

  contentChildren.push({
    id: nextId("secondary-cta"),
    type: "Button",
    props: { className: "w-full", variant: "outline" },
    children: [track(hints.secondaryCta)]
  });

  for (const token of uniqueStrings(input.requiredTextTokens)) {
    if (usedTexts.has(token.toLowerCase())) {
      continue;
    }

    contentChildren.push({
      id: nextId("token"),
      type: "Text",
      props: { className: "text-sm text-muted-foreground" },
      children: [track(token)]
    });
  }

  return {
    id: "root",
    type: "Card",
    props: { className: cardClassParts.join(" ") },
    children: [
      {
        id: "header",
        type: "CardHeader",
        children: [
          {
            id: "title",
            type: "CardTitle",
            children: [track(hints.title)]
          },
          {
            id: "description",
            type: "CardDescription",
            children: [track(hints.description)]
          }
        ]
      },
      {
        id: "content",
        type: "CardContent",
        props: { className: "space-y-3" },
        children: contentChildren
      }
    ]
  };
}

export async function* runGeneration(
  request: GenerateRequest,
  deps: OrchestratorDeps
): AsyncGenerator<StreamEvent> {
  const generationId = randomUUID();
  const startedAt = Date.now();
  const warnings: Array<{ code: string; message: string }> = [];
  let patchCount = 0;
  let modelOutputText = "";
  const getDurationMs = (): number => Math.max(0, Date.now() - startedAt);
  const appendModelOutput = (chunk: string): void => {
    if (chunk.length === 0 || modelOutputText.length >= 20_000) {
      return;
    }

    const remaining = 20_000 - modelOutputText.length;
    modelOutputText += chunk.slice(0, remaining);
  };
  const recordFailure = async (errorCode: string): Promise<void> => {
    try {
      await deps.persistence.recordGenerationFailure({
        threadId: request.threadId,
        generationId,
        warningCount: warnings.length,
        patchCount,
        durationMs: getDurationMs(),
        errorCode
      });
    } catch {
      // Failure logging must never break the generation stream.
    }
  };

  try {
    const threadBundle = await deps.persistence.getThreadBundle(request.threadId);
    if (!threadBundle) {
      yield {
        type: "error",
        generationId,
        code: "THREAD_NOT_FOUND",
        message: `Thread '${request.threadId}' not found.`
      };
      return;
    }

    const baseVersion = await deps.persistence.getVersion(request.threadId, request.baseVersionId);
    if (request.baseVersionId && !baseVersion) {
      await recordFailure("BASE_VERSION_CONFLICT");
      yield {
        type: "error",
        generationId,
        code: "BASE_VERSION_CONFLICT",
        message: `Base version '${request.baseVersionId}' was not found for thread '${request.threadId}'.`
      };
      return;
    }

    let canonicalSpec: UISpec =
      baseVersion?.specSnapshot ??
      ({
        root: "",
        elements: {}
      } satisfies UISpec);

    yield { type: "status", generationId, stage: "pass1_extract_components" };
    const pass1 = await deps.model.extractComponents({
      prompt: request.prompt,
      previousSpec: baseVersion?.specSnapshot ?? null
    });

    yield { type: "status", generationId, stage: "mcp_fetch_context" };
    const mcpContext = await deps.mcp.fetchContext(pass1.components);

    const constraints = buildConstraintSet({
      prompt: request.prompt,
      pass1,
      mcpContext
    });
    const allowedComponentTypes = constraints.allowedComponentTypes;

    const validateAndDiffCandidate = (
      candidateSpec: UISpec
    ):
      | { type: "valid"; patches: ReturnType<typeof diffSpecs>; nextSpec: UISpec }
      | {
          type: "invalid";
          violations: ConstraintViolation[];
          warnings: Array<{ code: string; message: string }>;
          fatalError: { code: string; message: string } | null;
        } => {
      const validation = validateSpec(candidateSpec, { allowedComponentTypes });

      if (!validation.valid) {
        const nextWarnings = validation.issues.map((issue) => ({
          code: issue.code,
          message: issue.message
        }));
        const fatalIssue = validation.issues.find((issue) => fatalValidationCodes.has(issue.code));

        return {
          type: "invalid",
          violations: [],
          warnings: nextWarnings,
          fatalError: fatalIssue
            ? {
                code: fatalIssue.code,
                message: fatalIssue.message
              }
            : null
        };
      }

      const constraintViolations = validateConstraintSet(candidateSpec, constraints);
      if (constraintViolations.length > 0) {
        return {
          type: "invalid",
          violations: constraintViolations,
          warnings: constraintViolations.map((violation) => ({
            code: violation.code,
            message: violation.message
          })),
          fatalError: null
        };
      }

      return {
        type: "valid",
        patches: diffSpecs(canonicalSpec, candidateSpec),
        nextSpec: candidateSpec
      };
    };

    function* processCandidateNode(
      candidateNode: UIComponentNode
    ): Generator<StreamEvent, "accepted" | "rejected" | string, void> {
      const candidateSpec = normalizeTreeToSpec(candidateNode);
      const result = validateAndDiffCandidate(candidateSpec);

      if (result.type === "invalid") {
        if (result.violations.length > 0) {
          lastConstraintViolations = result.violations;
        }
        for (const issue of result.warnings) {
          const warning = {
            type: "warning" as const,
            generationId,
            code: issue.code,
            message: issue.message
          };
          warnings.push({ code: warning.code, message: warning.message });
          yield warning;
        }

        if (result.fatalError) {
          yield {
            type: "error",
            generationId,
            code: result.fatalError.code,
            message: result.fatalError.message
          };
          return result.fatalError.code;
        }

        return "rejected";
      }

      for (const patch of result.patches) {
        patchCount += 1;
        yield {
          type: "patch",
          generationId,
          patch
        };
      }

      canonicalSpec = result.nextSpec;
      return "accepted";
    }

    let acceptedCandidate = false;
    let sawAnyCandidate = false;
    let lastConstraintViolations: ConstraintViolation[] = [];
    let streamFailureMessage: string | null = null;

    for (let attempt = 1; attempt <= MAX_PASS2_ATTEMPTS; attempt += 1) {
      yield {
        type: "status",
        generationId,
        stage: attempt === 1 ? "pass2_stream_design" : `pass2_stream_design_retry_${attempt}`
      };

      let buffer = "";
      const streamPrompt =
        attempt === 1
          ? request.prompt
          : buildRetryPrompt(request.prompt, lastConstraintViolations, attempt);

      try {
        for await (const chunk of deps.model.streamDesign({
          prompt: streamPrompt,
          previousSpec: baseVersion?.specSnapshot ?? null,
          componentContext: mcpContext
        })) {
          appendModelOutput(chunk);
          buffer += chunk;
          const extracted = extractCompleteJsonObjects(buffer);
          buffer = extracted.remainder;

          for (const jsonObject of extracted.objects) {
            const candidateNode = parseCandidateObject(jsonObject);
            if (!candidateNode) {
              continue;
            }

            sawAnyCandidate = true;
            const outcome = yield* processCandidateNode(candidateNode);
            if (outcome === "accepted") {
              acceptedCandidate = true;
              continue;
            }

            if (outcome !== "rejected") {
              await recordFailure(outcome);
              return;
            }
          }
        }
      } catch (error) {
        streamFailureMessage =
          error instanceof Error ? error.message : "Pass 2 stream failed unexpectedly.";
        const streamWarning = {
          type: "warning" as const,
          generationId,
          code: "PASS2_STREAM_FAILED",
          message: streamFailureMessage
        };
        warnings.push({ code: streamWarning.code, message: streamWarning.message });
        yield streamWarning;
        break;
      }

      if (buffer.trim()) {
        const extracted = extractCompleteJsonObjects(buffer);
        for (const jsonObject of extracted.objects) {
          const candidateNode = parseCandidateObject(jsonObject);
          if (!candidateNode) {
            continue;
          }

          sawAnyCandidate = true;
          const outcome = yield* processCandidateNode(candidateNode);
          if (outcome === "accepted") {
            acceptedCandidate = true;
            continue;
          }

          if (outcome !== "rejected") {
            await recordFailure(outcome);
            return;
          }
        }
      }

      if (streamFailureMessage) {
        break;
      }

      const finalViolations = validateConstraintSet(canonicalSpec, constraints);
      if (finalViolations.length === 0 && (pass1.intentType !== "new" || patchCount > 0)) {
        acceptedCandidate = true;
        lastConstraintViolations = [];
        break;
      }

      lastConstraintViolations = finalViolations;
      if (attempt < MAX_PASS2_ATTEMPTS) {
        const retryWarning = {
          type: "warning" as const,
          generationId,
          code: "CONSTRAINT_RETRY",
          message: `Retrying generation to satisfy constraints (attempt ${attempt + 1}/${MAX_PASS2_ATTEMPTS}).`
        };
        warnings.push({ code: retryWarning.code, message: retryWarning.message });
        yield retryWarning;
      }
    }

    if (!acceptedCandidate || (pass1.intentType === "new" && patchCount === 0)) {
      const fallbackNode = buildDeterministicCardNode({
        prompt: request.prompt,
        requiredTextTokens: constraints.requiredTextTokens,
        requiredComponentTypes: constraints.requiredComponentTypes
      });
      const fallbackSpec = normalizeTreeToSpec(fallbackNode);
      const fallbackResult = validateAndDiffCandidate(fallbackSpec);

      if (fallbackResult.type === "valid") {
        const fallbackWarning = {
          type: "warning" as const,
          generationId,
          code: "FALLBACK_APPLIED",
          message: "Applied deterministic fallback UI to guarantee a renderable result."
        };
        warnings.push({ code: fallbackWarning.code, message: fallbackWarning.message });
        yield fallbackWarning;

        for (const patch of fallbackResult.patches) {
          patchCount += 1;
          yield {
            type: "patch",
            generationId,
            patch
          };
        }

        canonicalSpec = fallbackResult.nextSpec;
      } else {
        const reason =
          !sawAnyCandidate || lastConstraintViolations.length === 0
            ? streamFailureMessage ?? "Model did not produce a valid non-empty constrained candidate."
            : lastConstraintViolations.map((violation) => violation.message).join(" ");

        await recordFailure("MCP_CONSTRAINT_NOT_SATISFIED");
        yield {
          type: "error",
          generationId,
          code: "MCP_CONSTRAINT_NOT_SATISFIED",
          message: reason
        };
        return;
      }
    }

    const hash = specHash(canonicalSpec);
    const assistantResponseText = modelOutputText.trim() || JSON.stringify(canonicalSpec);
    const assistantReasoningText = buildAssistantReasoningText({
      prompt: request.prompt,
      intentType: pass1.intentType,
      confidence: pass1.confidence,
      componentNames: pass1.components,
      mcpContextVersion: mcpContext.contextVersion,
      mcpRuleCount: mcpContext.componentRules.length,
      patchCount,
      warningCount: warnings.length,
      finalElementCount: Object.keys(canonicalSpec.elements).length
    });
    const persisted = await deps.persistence.persistGeneration({
      threadId: request.threadId,
      generationId,
      prompt: request.prompt,
      assistantResponseText,
      assistantReasoningText,
      baseVersionId: request.baseVersionId,
      specSnapshot: canonicalSpec,
      specHash: hash,
      mcpContextUsed: pass1.components,
      warnings,
      patchCount,
      durationMs: getDurationMs()
    });

    yield {
      type: "done",
      generationId,
      versionId: persisted.version.versionId,
      specHash: hash
    };
  } catch (error) {
    await recordFailure("GENERATION_EXCEPTION");
    yield {
      type: "error",
      generationId,
      code: "GENERATION_EXCEPTION",
      message: error instanceof Error ? error.message : "Unknown generation error."
    };
  }
}
