/**
 * Persistent browser profile for authenticated Playwright sessions.
 * Uses a shared Chrome profile directory so login state persists across runs.
 */
import { existsSync } from "fs";
import { join } from "path";

const PROFILE_DIR = join(process.cwd(), "input", "auth", "browser-profile");

export function getBrowserProfileDir(): string | undefined {
  return existsSync(PROFILE_DIR) ? PROFILE_DIR : undefined;
}
