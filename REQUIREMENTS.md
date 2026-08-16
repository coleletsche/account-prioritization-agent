# Account Prioritization MVP — Requirements

## Interpretation

Give Sales a dependable ranking of the complete eligible account book. The VP sees the full team view and each SDR sees every eligible owned organization. “Priority” is a deterministic ordering from recent engagement, account value, and contact staleness. An LLM may interpret the fixed result and recommend an action, but the score remains a transparent heuristic—not a conversion probability.

## MVP scope and assumptions

- Inputs are the supplied account CSV and engagement JSON, treated as CRM exports. The bundled week is August 17, 2026; users may choose another as-of date.
- Account owner partitions rep queues. Region and industry are filters only.
- ARR is an unconfirmed account-value proxy, not necessarily contract value or open pipeline.
- The first-run flow requires both exports or the explicit bundled-sample shortcut. Processing, uploaded files, and agent output are session-only.
- AI is optional and returns only `why_now`, `recommended_action`, `urgency`, `call_angle`, and `confidence`. It never scores, reorders, clears warnings, or invents evidence.

## Prioritization approach

Intent is event weight × `ln(1 + count)` × 30-day half-life with a small capped signal-breadth multiplier, normalized to p95. Demo requests weigh 10 versus 1 for email opens. Account value combines tier (65%) and ARR-to-p95 (35%); account score combines available value and contact staleness. Missing/future values remain unknown and are omitted. Priority preserves the 55% intent, 30% value, and 15% timing defaults, reweighted over known inputs. Bands are fixed: P0 ≥80, P1 ≥65, P2 ≥45, otherwise P3.

## Data and confidence decisions

Inputs are Zod validated and labeled `valid`, `warning`, or `blocked`. Required-schema failures reject refresh atomically; missing ARR/contact, negative or suspicious ARR, future dates, unknown events, invalid suppression, contradictory records, and exact duplicate events remain visible. Resolution prefers exact CRM ID, domain, name, then confirmed/deterministic alias. Ambiguous matches are never guessed. Duplicate events are preserved as evidence but the duplicate copy is explicitly blocked from scoring.

Confidence is separate from score: high has no warnings, medium has usable warnings, and low is held from ranking. Deterministic policy forces `needs_data_review` for critical data or unresolved identity and `no_action` for explicit suppression, even after model output. The separate review queue shows category, severity, row evidence, and a suggested CRM correction.

## Definition of success

The supplied files reproduce 300 account rows, 360 signals, 286 resolved organizations, 14 duplicate-domain groups, 360 uniquely mapped signals, and 285 eligible ranked organizations. Every eligible row receives an action; one unresolved identity remains in human review. A reviewer can explain the first rank and action in under two minutes. In production, compare contact, meeting, and opportunity rates by band and recommended action while monitoring coverage, policy overrides, stale exports, and review volume.

## Non-goals and next steps

No predictive ML, enrichment, live CRM sync, RBAC, persistence, territory balancing, capacity optimization, or automated outreach. Next steps are stakeholder weight calibration, stable CRM account IDs, scheduled Monday exports, outcome feedback, score-version history, and controlled experiments against the current SDR workflow.
