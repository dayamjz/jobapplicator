/**
 * Model router: ChatGPT cheap model by default; Claude as fallback when rate limited.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type CoreMessage, type LanguageModel } from "ai";
import type { DelayConfig } from "../types.js";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEFAULT_MODEL = "gpt-4o-mini";
const FALLBACK_MODEL = "claude-3-5-haiku-20241022";

function getDefaultModel(): LanguageModel {
  return openai(DEFAULT_MODEL);
}

function getFallbackModel(): LanguageModel {
  return anthropic(FALLBACK_MODEL);
}

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("Rate limit")
  );
}

export interface GenerateOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export async function generateWithFallback(options: GenerateOptions): Promise<string> {
  const model = getDefaultModel();
  try {
    const { text } = await generateText({
      model,
      system: options.system,
      prompt: options.prompt,
      maxTokens: options.maxTokens ?? 4096,
    });
    return text;
  } catch (err) {
    if (isRateLimitError(err)) {
      console.warn("Rate limited, retrying with Claude:", (err as Error).message);
      const { text } = await generateText({
        model: getFallbackModel(),
        system: options.system,
        prompt: options.prompt,
        maxTokens: options.maxTokens ?? 4096,
      });
      return text;
    }
    throw err;
  }
}
