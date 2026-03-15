import {
  PASS2_EXAMPLE_TREE,
  buildPass2CatalogSection
} from "@repo/component-catalog";
import {
  compileCatalogPromptBlockV2,
  compilePass2ExampleSnapshotV2,
  compileSemanticContractBlockV2
} from "@repo/component-catalog/compiler";
import type { ExtractComponentsInput, StreamDesignInput } from "../interfaces";
import { buildComponentContextPromptSection } from "./component-context-prompt";
import { buildPass2ContractBlock, buildPromptSkillSection } from "./prompt-skill";

export function buildPass1Prompt(input: ExtractComponentsInput): string {
  const previousSpec = input.previousSpec ? JSON.stringify(input.previousSpec) : "null";
  return [
    "You are a component extractor for a React UI generator.",
    'Return strict JSON object only with keys: components (string[]), intentType ("new"|"modify"), confidence (0..1).',
    "Do not include markdown.",
    `Prompt: ${input.prompt}`,
    `PreviousSpec: ${previousSpec}`
  ].join("\n");
}

export function buildPass2Prompt(input: StreamDesignInput): string {
  const previousSpec = input.previousSpec ? JSON.stringify(input.previousSpec) : "null";
  const contextSection = buildComponentContextPromptSection(input.componentContext);
  const example = JSON.stringify(PASS2_EXAMPLE_TREE, null, 2);
  const catalogSection = buildPass2CatalogSection();
  const skillSection = buildPromptSkillSection({ prompt: input.prompt, isV2: false });
  const contractSection = buildPass2ContractBlock(false);

  return [
    "You generate rich UI tree snapshots for a React renderer with strict contract compliance.",
    contractSection,
    catalogSection,
    skillSection,
    "Composition rules:",
    "- Card must contain CardHeader with CardTitle and optional CardDescription.",
    "- Card must contain CardContent for the body/actions.",
    "- Place action components like Button/Badge in CardContent when relevant.",
    "- Textual UI content must be represented as string children.",
    "Generate visually complete output with meaningful copy and spacing cues, not skeletal placeholders.",
    "Reference example of a valid complete snapshot:",
    example,
    contextSection,
    `Prompt: ${input.prompt}`,
    `PreviousSpec: ${previousSpec}`
  ].join("\n");
}

export function buildPass2PromptV2(input: StreamDesignInput): string {
  const previousSpec = input.previousSpec ? JSON.stringify(input.previousSpec) : "null";
  const contextSection = buildComponentContextPromptSection(input.componentContext);
  const example = JSON.stringify(compilePass2ExampleSnapshotV2(), null, 2);
  const catalogSection = compileCatalogPromptBlockV2();
  const skillSection = buildPromptSkillSection({ prompt: input.prompt, isV2: true });
  const contractSection = [buildPass2ContractBlock(true), compileSemanticContractBlockV2()].join("\n");

  return [
    "You generate rich semantic UI tree snapshots for a React runtime with strict contract compliance.",
    contractSection,
    catalogSection,
    skillSection,
    "SEMANTIC CONTRACT:",
    "- Use visible for conditional rendering (boolean, $state comparators, $and, $or, not).",
    "- Use repeat with statePath for array iteration.",
    "- Use on for events: press/change/submit with actions setState/pushState/removeState/validateForm.",
    "- Use watch for state-path triggered actions.",
    "- Use dynamic expressions in props/params: {$state}, {$item}, {$index}, {$bindState}, {$bindItem}.",
    "- Return complete visually rich layouts; never return empty skeletons.",
    "Reference example of a valid semantic snapshot:",
    example,
    contextSection,
    `Prompt: ${input.prompt}`,
    `PreviousSpec: ${previousSpec}`
  ].join("\n");
}
