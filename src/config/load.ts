import { readFileSync } from "fs";
import { resolve } from "path";
import { runConfigSchema, type RunConfigSchema } from "./schema.js";
import type { RunConfig, SearchConfig } from "../types.js";

const DEFAULT_CONFIG_PATH = "./config.json";
let _cached: RunConfig | null = null;
let _cachedPath: string | null = null;

export function getConfigPath(): string {
  return process.env.CONFIG_PATH ?? resolve(process.cwd(), DEFAULT_CONFIG_PATH);
}

export function loadConfig(): RunConfig {
  const path = getConfigPath();
  if (_cached && _cachedPath === path) return _cached;
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const parsed = runConfigSchema.parse(raw) as RunConfigSchema;
  _cached = {
    resumePath: parsed.resumePath,
    rateLimitWindowHours: parsed.rateLimitWindowHours,
    maxPrsPerSitePerWindow: parsed.maxPrsPerSitePerWindow,
    maxApplicationsPerSitePerWindow: parsed.maxApplicationsPerSitePerWindow,
    delays: parsed.delays,
    applySchedule: parsed.applySchedule,
    dryRun: parsed.dryRun ?? false,
    searches: parsed.searches as SearchConfig[],
  };
  _cachedPath = path;
  return _cached;
}

export function resetConfigCache(): void {
  _cached = null;
  _cachedPath = null;
}
