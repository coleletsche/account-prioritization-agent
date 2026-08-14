# Account Prioritization MVP — Requirements

## Interpretation

Give Sales a dependable, reproducible Monday call plan: a global Top 25 for the VP and up to ten eligible organizations per SDR. “Priority” means relative usefulness for outreach this week based on recent engagement, account value, and time since contact. It is a transparent operating heuristic, not a conversion probability.

## MVP scope and assumptions

- Inputs are the supplied account CSV and engagement JSON, treated as CRM exports. The bundled week is August 17, 2026; users may choose another as-of date.
- Account owner partitions rep queues. Region and industry are filters only.
- ARR is an unconfirmed account-value proxy, not necessarily contract value or open pipeline.
- Processing, uploaded files, and briefing output are session-only. No CRM connection, persistence, auth, or writeback is required.
- AI is optional and summarizes the deterministic ranking; it never scores, reorders, or invents account evidence.

## Prioritization approach

Intent is event weight × `ln(1 + count)` × 30-day half-life, normalized to the cohort p95 and capped at 100. Event weights are demo request 10, webinar 6, content download 5, page visit 2, and email open 1. Account value combines tier (65%) and ARR-to-p95 (35%), reweighted over available inputs. Contact timing reaches 100 after 90 days; missing or future dates receive neutral 50 with a warning. The default score is 55% intent, 30% account value, and 15% contact timing. Ties break by intent, value, then canonical name. Users may change weights, which always total 100%.

## Data and confidence decisions

Inputs are Zod validated. Required-file schema failures reject the refresh atomically; invalid row values remain visible in counts or the review queue. Valid hostnames define organization candidates. Same-domain rows merge only when owner, tier, region, and industry do not conflict; aliases, latest valid contact, and highest valid nonnegative ARR are retained. Engagement names use deterministic normalization and a fixed abbreviation dictionary. Ambiguous matches are never fuzzy-attached.

Confidence is separate from score: high has no warnings, medium has usable warnings, and low is held from ranking. The review queue shows category, severity, row evidence, and a suggested CRM correction. Stale data, future dates, unmatched signals, ownership conflicts, and invalid identities are explicit.

## Definition of success

The supplied files reproduce 300 account rows, 360 signals, 286 resolved organizations, 14 duplicate-domain groups, and 360 uniquely mapped signals. A reviewer can find a rep’s Top 10 and explain the first rank in under two minutes. Every rank is deterministic and exportable, each source row is accounted for, and failed uploads cannot replace the current list. In production, compare contact, meeting, and opportunity rates by rank band while monitoring coverage, overrides, stale exports, and review-queue volume.

## Non-goals and next steps

No predictive ML, enrichment, live CRM sync, RBAC, persistence, territory balancing, capacity optimization, or automated outreach. Next steps are stakeholder weight calibration, stable CRM account IDs, scheduled Monday exports, outcome feedback, score-version history, and controlled experiments against the current SDR workflow.
