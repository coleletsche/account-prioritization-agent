import { z } from "zod";
import { EVENT_TYPES, type DataQualityIssue, type RankedAccount, type ResolutionStatistics, type ScoreWeights } from "./data";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const BriefingRequestSchema = z.object({
  asOfDate: isoDate,
  weights: z.object({
    intent: z.number().min(0).max(100),
    value: z.number().min(0).max(100),
    timing: z.number().min(0).max(100),
  }).strict().refine((weights) => Math.abs(weights.intent + weights.value + weights.timing - 100) < 0.001, "Weights must total 100."),
  quality: z.object({
    totalIssues: z.number().int().min(0).max(100_000),
    highIssues: z.number().int().min(0).max(100_000),
    mediumIssues: z.number().int().min(0).max(100_000),
    lowIssues: z.number().int().min(0).max(100_000),
    excludedOrganizations: z.number().int().min(0).max(100_000),
    unmatchedSignals: z.number().int().min(0).max(100_000),
  }).strict(),
  accounts: z.array(z.object({
    rank: z.number().int().min(1).max(100_000),
    owner: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    score: z.number().min(0).max(100),
    factors: z.object({ intent: z.number().min(0).max(100), value: z.number().min(0).max(100), timing: z.number().min(0).max(100) }).strict(),
    confidence: z.enum(["high", "medium", "low"]),
    dominantReason: z.string().trim().min(1).max(300),
    recentIntent: z.object({ type: z.enum(EVENT_TYPES), date: isoDate, count: z.number().int().positive().max(1_000_000) }).strict().nullable(),
    warningCount: z.number().int().min(0).max(1_000),
  }).strict()).max(40),
}).strict();

export const WeeklyBriefingSchema = z.object({
  headline: z.string().trim().min(1).max(140),
  themes: z.array(z.string().trim().min(1).max(220)).min(1).max(4),
  actions: z.array(z.string().trim().min(1).max(240)).min(1).max(5),
  caveats: z.array(z.string().trim().min(1).max(220)).max(4),
}).strict();

export const BriefingApiResponseSchema = z.object({
  briefing: WeeklyBriefingSchema,
  source: z.enum(["ai", "fallback"]),
  warning: z.string().max(300).optional(),
}).strict();

export type BriefingRequest = z.infer<typeof BriefingRequestSchema>;
export type WeeklyBriefing = z.infer<typeof WeeklyBriefingSchema>;
export type BriefingApiResponse = z.infer<typeof BriefingApiResponseSchema>;

export function buildBriefingRequest(
  accounts: RankedAccount[],
  options: { asOfDate: string; weights: ScoreWeights; issues: DataQualityIssue[]; statistics: ResolutionStatistics },
): BriefingRequest {
  return BriefingRequestSchema.parse({
    asOfDate: options.asOfDate,
    weights: options.weights,
    quality: {
      totalIssues: options.issues.length,
      highIssues: options.issues.filter((issue) => issue.severity === "high").length,
      mediumIssues: options.issues.filter((issue) => issue.severity === "medium").length,
      lowIssues: options.issues.filter((issue) => issue.severity === "low").length,
      excludedOrganizations: options.statistics.excludedOrganizations,
      unmatchedSignals: options.statistics.unmatchedSignals,
    },
    accounts: accounts.slice(0, 40).map((account) => {
      const latest = account.organization.engagements[0];
      return {
        rank: account.rank,
        owner: account.organization.owner,
        name: account.organization.canonicalName,
        score: account.score,
        factors: account.factors,
        confidence: account.organization.confidence,
        dominantReason: account.reason,
        recentIntent: latest ? { type: latest.eventType, date: latest.eventDate, count: latest.eventCount } : null,
        warningCount: options.issues.filter((issue) => issue.entityName === account.organization.canonicalName).length,
      };
    }),
  });
}

export function deterministicBriefing(input: BriefingRequest): WeeklyBriefing {
  const top = input.accounts[0];
  const topIntent = [...input.accounts].sort((a, b) => b.factors.intent - a.factors.intent || a.rank - b.rank)[0];
  const ownerCount = new Set(input.accounts.map((account) => account.owner)).size;
  const lowConfidenceCount = input.accounts.filter((account) => account.confidence !== "high").length;

  if (!top) {
    return {
      headline: `No eligible accounts for the week of ${input.asOfDate}`,
      themes: ["The current filters or validation holds leave no ranked shortlist to brief."],
      actions: ["Open the review queue and resolve held-out owner or identity records before assigning calls."],
      caveats: ["Priority is a transparent heuristic, not a conversion probability."],
    };
  }

  const themes = [
    `${top.name} leads the shortlist at ${top.score.toFixed(1)}, with ${top.dominantReason.toLowerCase()}`,
    topIntent && topIntent.name !== top.name ? `${topIntent.name} has the strongest normalized intent signal (${topIntent.factors.intent.toFixed(0)}).` : `The leading account also has the strongest normalized intent signal (${top.factors.intent.toFixed(0)}).`,
    `${input.accounts.length} shortlisted accounts span ${ownerCount} owner${ownerCount === 1 ? "" : "s"}.`,
  ];

  const actions = input.accounts.slice(0, 3).map((account) => `Have ${account.owner} contact ${account.name}; it is #${account.rank} overall with a ${account.score.toFixed(1)} priority score.`);
  const caveats = ["Priority is a relative weekly heuristic, not a conversion probability, and the briefing never changes ranks."];
  if (input.quality.totalIssues > 0) caveats.push(`${input.quality.totalIssues} data-quality flags remain, including ${input.quality.highIssues} high-severity item${input.quality.highIssues === 1 ? "" : "s"}.`);
  if (lowConfidenceCount > 0) caveats.push(`${lowConfidenceCount} shortlisted account${lowConfidenceCount === 1 ? " has" : "s have"} less than high confidence; confirm the drawer evidence before outreach.`);

  return { headline: `${top.name} leads this week’s call plan`, themes, actions, caveats };
}
