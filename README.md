# Velora Account Prioritization MVP

A desktop-first Next.js application that validates CRM account and engagement exports, deterministically ranks the complete eligible account book, and generates policy-checked AI outreach plans on demand. Every row includes reproducible scores, a P0–P3 band, and recent signals; AI-authored Why now, action, and call-plan guidance appears only after explicit generation.

**Live reviewer app:** [account-prioritization-agent-five.vercel.app](https://account-prioritization-agent-five.vercel.app/)

## What reviewers can do

- Upload both exports or choose the bundled sample, then analyze the account book as one job.
- Select the VP or a rep persona from the top navigation; reps receive their complete read-only owned account book.
- Filter by owner, tier, region, industry, confidence, or account name.
- Open an account to inspect score factors, exact inputs, engagement history, aliases, and warnings.
- Change the three scoring weights while preserving a 100% total, then reset to defaults.
- Validate two replacement exports before atomically applying them in browser memory.
- Reconcile account, engagement, identity, conflict, and duplicate warnings against a browser-only working copy, then rescore the complete cohort.
- Download corrected account CSV and engagement JSON exports alongside the full reproducible ranking.
- Optionally generate every AI outreach plan at intake, generate the full book later, or generate one account at a time.
- Keep ungenerated and failed plans visibly empty instead of presenting deterministic copy as AI interpretation.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then upload both exports or choose **Use sample data**. The default scoring week is `2026-08-17`.

AI interpretation is optional. Without a key the deterministic ranking remains fully usable, while outreach plans remain ungenerated. To enable model-written Why now, action, and call-plan text locally:

```bash
cp .env.example .env.local
# Set OPENAI_API_KEY in .env.local, then restart npm run dev.
```

`.env.local` is ignored by Git and Vercel packaging. The server accepts the validated account book and sends it to `gpt-5.4-nano` in internal batches of at most 40 with concurrency capped at three. Raw exports, websites, and free-form prompts are never sent.

## Verify

Install Playwright’s pinned browser once, then run the complete gate:

```bash
npx playwright install chromium
npm run verify
```

`npm run verify` runs ESLint, 59 Vitest unit/component tests, a production build, and six Playwright workflows covering first-run intake, on-demand and optional bulk AI plans, the complete account book, personas, reranking, source-backed reconciliation, replacement uploads, corrected exports, partial coverage, and the 390px mobile layout.

Individual commands:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

## Reproducible scoring

| Factor | Definition |
| --- | --- |
| Intent | `event weight × ln(1 + count) × 2^(-age_days / 30)`, with a capped breadth multiplier; normalized to p95 and capped at 100 |
| Account value | 65% tier and 35% ARR-to-p95; reweighted over available inputs |
| Contact timing | `min(days since contact / 90, 1) × 100`; missing/future values stay unknown and are omitted |
| Account score | Account value and contact timing combined over the inputs that are known |
| Final score | 55% Intent + 30% Account Value + 15% Contact Timing by default |

Tier values are Strategic 100, Enterprise 85, Mid-Market 55, and SMB 25. Event weights are demo request 10, webinar 6, content download 5, page visit 2, and email open 1. P0 is 80+, P1 is 65–79.99, P2 is 45–64.99, and P3 is below 45. Ties break by intent, account value, then canonical name. Confidence never changes the score.

Important: ARR is treated as an unconfirmed account-value proxy. The priority score is a relative weekly heuristic, not a conversion probability.

## Ingestion and entity resolution

- The account file must contain `account_name`, `industry`, `arr`, `last_contact_date`, `account_tier`, `website`, `region`, and `owner`.
- The engagement file must be a JSON array with `account_name`, `event_type`, `event_date`, and `event_count`.
- Structural failures reject both uploaded files together. Invalid rows become review issues rather than crashing the import.
- Optional stable `account_id`, domain, confirmed `aliases`, and `do_not_contact` fields are supported. Resolution prefers exact ID, domain, name, then deterministic alias normalization.
- Same-identity rows merge only when nonempty owner, tier, region, industry, and suppression values do not conflict. Ambiguous signals are held for review rather than guessed.
- Every usable record is labeled `valid`, `warning`, or `blocked`. Exact duplicate events remain visible but only the first is scored.

Expected bundled baseline: 300 account rows, 360 engagement rows, 286 resolved organizations, 14 duplicate-domain groups, and all 360 signals uniquely matched. One invalid identity is held from ranking, leaving 285 eligible organizations.

## Session refresh and privacy

Select one CSV and one JSON file, then click **Analyze account book**. Validation, resolution, and deterministic scoring run before the dashboard opens. The optional intake checkbox also generates all AI outreach plans; otherwise use a row action or **Generate all plans** later. Files and results remain in browser memory, and refresh returns to intake. Replacement imports do not change the active ranking unless the new pair validates successfully.

The VP can open **Data tools → Reconcile data** to edit the source row behind a warning. **Save & rescore** regenerates the working exports, reruns validation and entity resolution, and recomputes the entire cohort. Warnings leave the queue only when the corrected values pass validation. AI plans are retained only when their complete model-facing inputs remain unchanged. **Accounts CSV** and **Engagement JSON** download the corrected working copies; they never overwrite the user’s local files. The full-ranking export includes plan fields only for accounts whose AI plan was generated.

The recommendation route rejects free-form prompts, more than 400 accounts, bodies over 2 MB, mismatched account IDs, and invalid schemas. Each model batch has a 20-second timeout, and the route has best-effort per-IP throttling. The API identifies exactly which accounts received model output; failed batches stay visibly ungenerated and can be retried. Post-model policy forces `needs_data_review` for blocking identity/data and `no_action` for explicit suppression.

## Deploy to Vercel

Deploy the app first without an AI key; deterministic ranking still works and AI plan controls fail safely without displaying fallback copy:

```bash
vercel deploy -y
```

Before enabling AI on a public deployment, set an OpenAI project spend cap. Then add `OPENAI_API_KEY` as a server-side Preview/Production environment variable in Vercel and redeploy. Never prefix it with `NEXT_PUBLIC_`.

## Repository guide

- `src/lib/data/` — validation, normalization, and entity resolution
- `src/lib/scoring.ts` — pure deterministic scoring
- `src/lib/quality.ts` — as-of-date quality checks
- `src/lib/reconciliation.ts` — session source editing, correction validation, regrouping, and reprocessing
- `src/lib/export.ts` — safe full-ranking CSV generation
- `src/lib/agent/contracts.ts` — bounded validated facts and structured output schemas
- `src/lib/agent/policy.ts` — deterministic fallback actions and authoritative blocking rules
- `src/lib/agent/reasoning.ts` — isolated OpenAI call and operational safeguards
- `src/lib/agent/orchestrator.ts` — model-output identity checks and post-model policy
- `src/components/dashboard/` — dashboard, drawer, controls, upload/review, and recommendation UI
- `e2e/` — Playwright workflows and malformed fixtures
- [`REQUIREMENTS.md`](./REQUIREMENTS.md) — one-page product and decision brief
- [`WALKTHROUGH.md`](./WALKTHROUGH.md) — three-minute video script and shot list

## Out of scope

Production CRM synchronization, persistence, authentication/RBAC, CRM writeback, predictive ML, external enrichment, automatic outreach, and territory or capacity optimization.
