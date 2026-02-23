/**
 * Model router: ChatGPT cheap model by default; Claude as fallback when rate limited.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type LanguageModel } from "ai";

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

function isTransientError(err: unknown): boolean {
  if (isRateLimitError(err)) return false;
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("timeout") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNRESET")
  );
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GenerateOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export async function generateWithFallback(options: GenerateOptions): Promise<string> {
  const model = getDefaultModel();
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { text } = await generateText({
        model,
        system: options.system,
        prompt: options.prompt,
        maxTokens: options.maxTokens ?? 4096,
      });
      return text;
    } catch (err) {
      lastError = err;
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
      if (isTransientError(err) && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        console.warn(`Transient error (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}), retrying in ${delay}ms:`, (err as Error).message);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
