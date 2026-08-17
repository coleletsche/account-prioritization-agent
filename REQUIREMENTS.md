# Account Priority Agent — MVP Requirements

## Interpretation of the request

Give Sales a dependable, explainable order for working the complete eligible account book. The VP needs a team-wide view; each SDR needs the same published ranking filtered to their accounts. “Priority” is a deterministic heuristic based on engagement, account value, and contact timing—not a conversion probability. AI may turn fixed evidence into seller-ready guidance, but it never validates data, calculates scores, changes rank, or overrides policy.

## MVP scope and important assumptions

- Users upload an account CSV and engagement JSON or explicitly choose the bundled sample. Raw files and results remain in the browser session.
- The dashboard shows every eligible organization with filters and pagination. Owners partition rep views; industry and region filter but do not score. The VP can change weights and the as-of week; reps cannot.
- The bundled date is August 17, 2026. ARR is an unconfirmed account-value proxy, not necessarily contract value or pipeline.
- Validation labels records `valid`, `warning`, or `blocked`. Structural errors reject a dataset atomically. The VP can reconcile row-level issues, rerun the full pipeline, and download corrected exports; warnings clear only after revalidation.
- AI is optional per account, in bulk after ranking, or as an intake opt-in. Only compact validated summaries reach the server; raw exports never reach the model or persistent storage.

## Prioritization approach and key decisions

Entity resolution prefers exact CRM ID, normalized domain, exact name, then confirmed alias. Ambiguous matches are held for review rather than guessed. Compatible duplicates retain aliases, the latest valid contact, and highest nonnegative ARR without summing. Exact duplicate events stay visible, but only the first scores.

Intent uses event weight × `ln(1 + count)` × a 30-day half-life, plus a small capped breadth bonus. Weights are demo request 10, webinar 6, content download 5, page visit 2, and email open 1. Intent and ARR normalize to cohort p95 and cap at 100. Account value is 65% tier and 35% ARR; contact timing reaches 100 after 90 days. Default priority is 55% intent, 30% account value, and 15% timing. Unknowns stay unknown and available inputs are reweighted. Confidence remains separate. Bands are P0 ≥ 80, P1 ≥ 65, P2 ≥ 45, otherwise P3; ties resolve by intent, value, then name.

AI returns structured `why_now`, action, urgency, call angle, and confidence. Deterministic post-model policy forces `needs_data_review` for blocked data or unresolved identity and `no_action` for suppression. Failed AI leaves ranking intact and ready to retry; placeholder text is not presented as an AI plan.

## How the MVP will be judged

The supplied files must reproduce 300 account rows, 360 signals, 286 resolved organizations, 14 duplicate-domain groups, 360 uniquely mapped signals, and 285 eligible rankings; the held-out identity remains visible in reconciliation. Every rank must be reproducible from visible factors, and no source record may disappear without a statistic or issue. Weight/date changes rerank immediately; corrections rescore the cohort atomically; AI never affects rank. A reviewer should find an SDR’s book, explain its first account, and generate a plan in under two minutes. Lint, unit, build, and end-to-end checks must pass. Later field evaluation should compare contact, meeting, and opportunity rates by band while monitoring AI coverage, policy overrides, and unresolved warnings.

## Non-goals and next steps

No live CRM sync/writeback, persistence, authentication/RBAC, predictive ML, enrichment, territory balancing, capacity optimization, or automated outreach. Next steps are stakeholder calibration, stable CRM IDs, scheduled Monday ingestion, outcome feedback and score history, controlled workflow experiments, and production controls for access, spend, monitoring, and retention.
