# Velora Account Prioritization MVP

A desktop-first Next.js application that turns CRM account and engagement exports into a transparent Monday call plan. It gives Sales leadership a global Top 25, each SDR up to ten accounts, factor-level explanations, data-quality review, session-only refresh, CSV export, and an optional grounded AI briefing.

**Live reviewer app:** [account-prioritization-agent-itx4cs3ir-cole-1249s-projects.vercel.app](https://account-prioritization-agent-itx4cs3ir-cole-1249s-projects.vercel.app)

## What reviewers can do

- Switch from the VP overview to each rep’s Top 10.
- Filter by owner, tier, region, industry, confidence, or account name.
- Open an account to inspect score factors, exact inputs, engagement history, aliases, and warnings.
- Change the three scoring weights while preserving a 100% total, then reset to defaults.
- Validate two replacement exports before atomically applying them in browser memory.
- Inspect every data-quality flag and download the full reproducible ranking.
- Generate an optional weekly briefing that cannot change scores or ranks.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The bundled assessment data loads automatically for the week of `2026-08-17`.

The AI briefing is optional. Without a key it returns a visible deterministic fallback. To enable it locally:

```bash
cp .env.example .env.local
# Set OPENAI_API_KEY in .env.local, then restart npm run dev.
```

`.env.local` is ignored by Git and Vercel packaging. The server sends only at most 40 ranked summaries, active weights, as-of date, and aggregate quality counts to `gpt-5.4-nano`; raw exports are never sent.

## Verify

Install Playwright’s pinned browser once, then run the complete gate:

```bash
npx playwright install chromium
npm run verify
```

`npm run verify` runs ESLint, 30 Vitest unit/component tests, a production build, and five Playwright workflows covering sample load, SDR navigation, reranking/reset, account detail, review queue, good and bad uploads, CSV download, AI/fallback rendering, keyboard dismissal, and the 390px mobile layout.

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
| Intent | `event weight × ln(1 + count) × 2^(-age_days / 30)`, normalized to cohort p95 and capped at 100 |
| Account value | 65% tier and 35% ARR-to-p95; reweighted over available inputs |
| Contact timing | `min(days since contact / 90, 1) × 100`; missing/future dates use neutral 50 plus a warning |
| Final score | 55% Intent + 30% Account Value + 15% Contact Timing by default |

Tier values are Strategic 100, Enterprise 85, Mid-Market 55, and SMB 25. Event weights are demo request 10, webinar 6, content download 5, page visit 2, and email open 1. Ties break by intent, then account value, then canonical organization name. Confidence never changes the score.

Important: ARR is treated as an unconfirmed account-value proxy. The priority score is a relative weekly heuristic, not a conversion probability.

## Ingestion and entity resolution

- The account file must contain `account_name`, `industry`, `arr`, `last_contact_date`, `account_tier`, `website`, `region`, and `owner`.
- The engagement file must be a JSON array with `account_name`, `event_type`, `event_date`, and `event_count`.
- Structural failures reject both uploaded files together. Invalid rows become review issues rather than crashing the import.
- Organizations resolve by normalized valid hostname. Same-domain rows merge only when nonempty owner, tier, region, and industry values do not conflict.
- Engagement names use Unicode/case/punctuation normalization, legal-suffix removal, and a fixed abbreviation dictionary. Ambiguous signals are held for review rather than fuzzy-attached.

Expected bundled baseline: 300 account rows, 360 engagement rows, 286 resolved organizations, 14 duplicate-domain groups, and all 360 signals uniquely matched. One invalid identity is held from ranking, leaving 285 eligible organizations.

## Session refresh and privacy

Select one CSV and one JSON file, validate them, review the preview, then explicitly apply. Files remain in browser memory and a page refresh restores the bundled sample. The full-ranking export includes global and owner ranks, aliases, factor scores, confidence, reasons, warnings, effective weights, and as-of date.

The briefing route rejects free-form prompts, more than 40 accounts, bodies over 64 KB, and invalid schemas. It has a 12-second timeout and best-effort per-IP throttling. Missing credentials, rate limits, timeouts, invalid model output, or model errors return a deterministic fallback while preserving the ranking.

## Deploy to Vercel

Deploy the app first without an AI key; the briefing safely uses its deterministic fallback:

```bash
vercel deploy -y
```

Before enabling AI on a public deployment, set an OpenAI project spend cap. Then add `OPENAI_API_KEY` as a server-side Preview/Production environment variable in Vercel and redeploy. Never prefix it with `NEXT_PUBLIC_`.

## Repository guide

- `src/lib/data/` — validation, normalization, and entity resolution
- `src/lib/scoring.ts` — pure deterministic scoring
- `src/lib/quality.ts` — as-of-date quality checks
- `src/lib/export.ts` — safe full-ranking CSV generation
- `src/lib/briefing*.ts` — bounded briefing contract, fallback, and server handler
- `src/components/dashboard/` — dashboard, drawer, controls, upload/review, and briefing UI
- `e2e/` — Playwright workflows and malformed fixtures
- [`REQUIREMENTS.md`](./REQUIREMENTS.md) — one-page product and decision brief
- [`WALKTHROUGH.md`](./WALKTHROUGH.md) — three-minute video script and shot list

## Out of scope

Production CRM synchronization, persistence, authentication/RBAC, CRM writeback, predictive ML, external enrichment, automatic outreach, and territory or capacity optimization.
