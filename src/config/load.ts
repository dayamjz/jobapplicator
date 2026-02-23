import { readFileSync } from "fs";
import { resolve } from "path";
import { runConfigSchema, type RunConfigSchema } from "./schema.js";
import type { RunConfig, SearchConfig } from "../types.js";

const DEFAULT_CONFIG_PATH = "./config.json";

export function getConfigPath(): string {
  return process.env.CONFIG_PATH ?? resolve(process.cwd(), DEFAULT_CONFIG_PATH);
}

export function loadConfig(): RunConfig {
  const path = getConfigPath();
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const parsed = runConfigSchema.parse(raw) as RunConfigSchema;
  return {
    resumePath: parsed.resumePath,
    rateLimitWindowHours: parsed.rateLimitWindowHours,
    maxPrsPerSitePerWindow: parsed.maxPrsPerSitePerWindow,
    maxApplicationsPerSitePerWindow: parsed.maxApplicationsPerSitePerWindow,
    delays: parsed.delays,
    applySchedule: parsed.applySchedule,
    searches: parsed.searches as SearchConfig[],
  };
}
