import type { GenerationModelAdapter } from "./interfaces";
import {
  createGeminiGenerationModel,
  type GeminiGenerationModelOptions
} from "./gemini";
import {
  createOpenAIGenerationModel,
  type OpenAIGenerationModelOptions
} from "./openai";

export type LLMProvider = "gemini" | "openai";

export type ModelProviderConfig =
  | {
      provider: "gemini";
      options: GeminiGenerationModelOptions;
    }
  | {
      provider: "openai";
      options: OpenAIGenerationModelOptions;
    };

export function createGenerationModelAdapter(config: ModelProviderConfig): GenerationModelAdapter {
  switch (config.provider) {
    case "gemini":
      return createGeminiGenerationModel(config.options);
    case "openai":
      return createOpenAIGenerationModel(config.options);
    default: {
      const exhaustive: never = config;
      throw new Error(`Unsupported model provider config: ${JSON.stringify(exhaustive)}`);
    }
  }
}
