/**
 * Detect which ATS platform a URL belongs to based on URL patterns.
 */

export type ATSPlatform = "workday" | "lever" | "greenhouse" | "unknown";

const PATTERNS: [ATSPlatform, RegExp][] = [
  ["workday", /\.myworkdayjobs\.com/i],
  ["workday", /\.wd\d+\.myworkdaysite\.com/i],
  ["workday", /myworkday\.com/i],
  ["lever", /jobs\.lever\.co/i],
  ["greenhouse", /boards\.greenhouse\.io/i],
  ["greenhouse", /\.greenhouse\.io/i],
];

export function detectATS(url: string): ATSPlatform {
  for (const [platform, pattern] of PATTERNS) {
    if (pattern.test(url)) return platform;
  }
  return "unknown";
}
