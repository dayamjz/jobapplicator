# Job Applicator – LinkedIn, Indeed & Greenhouse

Automated job application pipeline: search jobs, generate tailored resumes and cover letters, open one PR per application for human sign-off, then apply on a schedule (timed, so you can be away).

## Setup

1. **Clone and install**
   ```bash
   cd Applicator
   npm install
   npx playwright install chromium
   ```

2. **Initialize input folder (samples)**
   ```bash
   npm run init-inputs
   ```
   Then add your resume: copy `input/resume.sample.md` to `input/resume.docx` or create `input/resume.docx` with your content. Edit `input/profile.yaml` with your answers for apply forms.

3. **Config**
   - Copy `config.example.json` to `config.json` and set `resumePath` to `./input/resume.docx`.
   - Copy `.env.example` to `.env` and set:
     - `OPENAI_API_KEY` (default model)
     - `ANTHROPIC_API_KEY` (fallback when rate limited)
     - `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` (for PR creation)

4. **Run**
   - **Search & open PRs**: `npm run dev -- search` (max 30 new job PRs per site per 4 hours; human-like delays).
   - **Apply** (after merging PRs): `npm run dev -- apply` (run on a schedule; 30 applications per site per 4 hours).

## Flow

- **Search** → **Generate** (resume + cover per job using two prompt configs from `input/prompts/`) → **Push** → **Open one PR per application**.
- Human **merges** PR to approve. **Apply** loop runs on a schedule and submits approved jobs; marks them applied and updates job memory in `input/applied-jobs.json`.

## Rate limits (ToS mitigation)

- 30 new job PRs per site (LinkedIn, Indeed, Greenhouse) per 4-hour window.
- 30 applications per site per 4-hour window.
- Human-like delays between page loads, form fields, and applications (configurable in `config.json`).

## Inputs

- `input/resume.docx` – base resume (structure extracted for tailoring).
- `input/profile.yaml` – answers for site apply questions (discovery adds new ones and commits directly).
- `input/prompts/resume.yaml`, `cover.yaml` – prompt configs (test skills-highlighting separately).
- `input/templates/*.yaml` – site question templates (LinkedIn, Indeed, Greenhouse).
- `input/applied-jobs.json` – job memory (applied list + opened PRs); do not edit by hand.

## Jobs folder

Generated artifacts live under `jobs/<role>/<jobId>/`: `resume.md`, `resume.docx` (optional), `cover.md`, `meta.json`, `job-description.md`. One PR per job; merge = approved; apply step runs for merged jobs only.

## Testing

- **Run once:** `npm run test`
- **Watch mode:** `npm run test:watch` (re-runs on file changes)

Tests use **Vitest** and live under `tests/`. They are unit and mocked-integration only (no live browser or APIs). Tests encode the planned behavior; when a test fails, the implementation is updated to satisfy the test, not the other way around.

| File | Coverage |
|------|----------|
| `config.test.ts` | Run config schema and load (resumePath, rate limits, delays, searches, urlParams). |
| `memory.test.ts` | Job memory: applied list, opened PRs, 4h window, caps (canApplyMore, canOpenMorePrs). |
| `delay.test.ts` | Human-like delays: delayMs range, delay() resolution. |
| `prompts.test.ts` | Load resume/cover YAML from input/prompts; fillTemplate. |
| `docx.test.ts` | Resume structure from .md; structureToPrompt. |
| `sites-urls.test.ts` | buildSearchUrl for LinkedIn, Indeed, Greenhouse (urlParams). |
| `generation.test.ts` | generateForJob output (jobs/<role>/<jobId>, resume.md, cover.md, meta.json, job-description.md); LLM mocked. |
| `apply-runner.test.ts` | findApprovedJobs (approved-only, not in applied list); JobFolder shape. |
| `ralph-loop.test.ts` | runSiteLoop returns rate_limit_4h when PR cap reached (search/generate/github mocked). |
| `init-inputs.test.ts` | Samples layout and applied-jobs.json shape. |
