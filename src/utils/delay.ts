/**
 * Human-like delays: randomized between min and max ms.
 * Used between page loads, form fields, applications, search clicks.
 */
import type { DelayConfig } from "../types.js";

export function delayMs(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}

export function delay(minMs: number, maxMs: number): Promise<void> {
  const ms = delayMs(minMs, maxMs);
  return new Promise((r) => setTimeout(r, ms));
}

export async function delayPageLoad(config: DelayConfig): Promise<void> {
  const [min, max] = config.pageLoadMs;
  await delay(min, max);
}

export async function delayFormField(config: DelayConfig): Promise<void> {
  const [min, max] = config.formFieldMs;
  await delay(min, max);
}

export async function delayBetweenApplications(config: DelayConfig): Promise<void> {
  const [min, max] = config.betweenApplicationsMs;
  await delay(min, max);
}

export async function delaySearchResultClick(config: DelayConfig): Promise<void> {
  const [min, max] = config.searchResultClickMs;
  await delay(min, max);
}
