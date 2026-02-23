/**
 * Load saved Playwright storage state (cookies, localStorage) for a site.
 * Returns the path to the storage state file if it exists, or undefined.
 */
import { existsSync } from "fs";
import { join } from "path";
import type { Site } from "../types.js";

export function getAuthStatePath(site: Site): string | undefined {
  const p = join(process.cwd(), "input", "auth", `${site}.json`);
  return existsSync(p) ? p : undefined;
}
