# Tests

## How to run

- **Once:** `npm run test`
- **Watch:** `npm run test:watch` (re-runs on file changes)

Framework: Vitest. All tests live under `tests/` and are unit or mocked-integration (no live browser or APIs).

## File-to-coverage

| File | What it tests |
|------|----------------|
| `config.test.ts` | Run config schema (Zod), load from path; search config and urlParams per site; defaults. |
| `memory.test.ts` | applied-jobs.json load/save; addOpenedPr, addAppliedJob; isInAppliedList; countInWindow; canApplyMore, canOpenMorePrs; WINDOW_MS. |
| `delay.test.ts` | delayMs(min, max) in range and integer; delay() resolves in range. |
| `prompts.test.ts` | loadResumePromptConfig, loadCoverPromptConfig from YAML; fillTemplate (replace {{key}}, unknown → empty). |
| `docx.test.ts` | extractResumeStructure from .md (headings, rawText); structureToPrompt. |
| `sites-urls.test.ts` | buildSearchUrl for LinkedIn (keywords, location, urlParams.linkedin), Indeed (q, l), Greenhouse (embed, for, urlParams.greenhouse). |
| `generation.test.ts` | generateForJob: job dir under jobs/<role>/<jobId>; resume.md, cover.md, meta.json, job-description.md; meta shape; LLM mocked. |
| `apply-runner.test.ts` | findApprovedJobs: only status approved, not in applied list; JobFolder fields. |
| `ralph-loop.test.ts` | runSiteLoop: processed 0 and rate_limit_4h when opened PRs at cap; search/generate/github mocked. |
| `init-inputs.test.ts` | Samples dir layout; applied-jobs.json has applied and openedPrs; init script exists. |
