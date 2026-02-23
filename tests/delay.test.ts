/**
 * Human-like delay tests: delayMs in range [min, max], delay resolves (plan: randomized delays between interactions).
 * Tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect } from "vitest";
import { delayMs, delay } from "../src/utils/delay.js";

describe("delayMs", () => {
  it("returns a number >= min and <= max when min < max", () => {
    for (let i = 0; i < 50; i++) {
      const v = delayMs(100, 200);
      expect(v).toBeGreaterThanOrEqual(100);
      expect(v).toBeLessThanOrEqual(200);
    }
  });

  it("returns min when min === max", () => {
    expect(delayMs(500, 500)).toBe(500);
  });

  it("returns integer", () => {
    const v = delayMs(1, 10);
    expect(Number.isInteger(v)).toBe(true);
  });
});

describe("delay", () => {
  it("resolves after a duration within [min, max] range", async () => {
    const min = 10;
    const max = 30;
    const start = Date.now();
    await delay(min, max);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(min - 2);
    expect(elapsed).toBeLessThanOrEqual(max + 50);
  });
});
