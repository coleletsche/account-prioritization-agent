import { z } from "zod";
import { EVENT_TYPES, type DataQualityIssue, type RankedAccount, type ValidationStatus } from "../data";

export const SALES_ACTIONS = ["call_today", "call_this_week", "email", "nurture", "research", "no_action", "needs_data_review"] as const;
export const ACTION_URGENCY = ["immediate", "high", "medium", "low", "none"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AgentAccountSchema = z.object({
  account_id: z.string().min(1).max(100),
  rank: z.number().int().positive(),
  owner_rank: z.number().int().positive(),
  owner: z.string().trim().min(1).max(100),
  account_name: z.string().trim().min(1).max(200),
  industry: z.string().trim().max(120).nullable(),
  region: z.string().trim().max(120).nullable(),
  tier: z.enum(["SMB", "Mid-Market", "Enterprise", "Strategic"]).nullable(),
  arr: z.number().nonnegative().nullable(),
  last_contact_date: isoDate.nullable(),
  contact_suppressed: z.boolean().nullable(),
  identity_resolved: z.boolean(),
  data_status: z.enum(["valid", "warning", "blocked"]),
  scores: z.object({
    account_score: z.number().min(0).max(100).nullable(),
    intent_score: z.number().min(0).max(100),
    priority_score: z.number().min(0).max(100),
    priority_band: z.enum(["P0", "P1", "P2", "P3"]),
  }).strict(),
  intent_features: z.object({
    signal_breadth: z.number().int().min(0).max(EVENT_TYPES.length),
    total_frequency: z.number().int().nonnegative(),
    latest_signal_date: isoDate.nullable(),
  }).strict(),
  deterministic_reason: z.string().trim().min(1).max(400),
  engagement_timeline: z.array(z.object({
    event_type: z.enum(EVENT_TYPES),
    event_date: isoDate,
    event_count: z.number().int().positive(),
    scored: z.boolean(),
  }).strict()).max(20),
  data_quality_flags: z.array(z.object({
    category: z.string().min(1).max(60),
    severity: z.enum(["low", "medium", "high"]),
    message: z.string().min(1).max(300),
    evidence: z.string().min(1).max(400),
    blocking: z.boolean(),
  }).strict()).max(20),
}).strict();

export const SalesAgentRequestSchema = z.object({
  as_of_date: isoDate,
  accounts: z.array(AgentAccountSchema).min(1).max(400),
}).strict();

export const SalesAgentBatchRequestSchema = z.object({
  as_of_date: isoDate,
  accounts: z.array(AgentAccountSchema).min(1).max(40),
}).strict();

export const AccountRecommendationSchema = z.object({
  account_id: z.string().min(1).max(100),
  why_now: z.string().trim().min(1).max(320),
  recommended_action: z.enum(SALES_ACTIONS),
  urgency: z.enum(ACTION_URGENCY),
  call_angle: z.string().trim().min(1).max(320),
  confidence: z.enum(["high", "medium", "low"]),
}).strict();

export const SalesRecommendationsSchema = z.object({
  recommendations: z.array(AccountRecommendationSchema).min(1).max(40),
}).strict();

export const SalesAgentApiResponseSchema = z.object({
  recommendations: z.array(AccountRecommendationSchema).min(1).max(400),
  generated_account_ids: z.array(z.string().min(1).max(100)).max(400),
  source: z.enum(["ai", "mixed", "fallback"]),
  coverage: z.object({
    total: z.number().int().positive().max(400),
    ai: z.number().int().nonnegative().max(400),
    fallback: z.number().int().nonnegative().max(400),
  }).strict(),
  warning: z.string().max(300).optional(),
}).strict().superRefine((response, context) => {
  if (response.coverage.ai + response.coverage.fallback !== response.coverage.total || response.recommendations.length !== response.coverage.total) {
    context.addIssue({ code: "custom", message: "Recommendation coverage must match the returned account set." });
  }
  const generatedIds = new Set(response.generated_account_ids);
  const recommendationIds = new Set(response.recommendations.map((recommendation) => recommendation.account_id));
  if (generatedIds.size !== response.generated_account_ids.length || generatedIds.size !== response.coverage.ai || response.generated_account_ids.some((id) => !recommendationIds.has(id))) {
    context.addIssue({ code: "custom", message: "Generated account IDs must identify exactly the AI-generated recommendations." });
  }
});

export type AgentAccount = z.infer<typeof AgentAccountSchema>;
export type SalesAgentRequest = z.infer<typeof SalesAgentRequestSchema>;
export type SalesAgentBatchRequest = z.infer<typeof SalesAgentBatchRequestSchema>;
export type AccountRecommendation = z.infer<typeof AccountRecommendationSchema>;
export type SalesRecommendations = z.infer<typeof SalesRecommendationsSchema>;
export type SalesAgentApiResponse = z.infer<typeof SalesAgentApiResponseSchema>;

function accountStatus(account: RankedAccount, issues: DataQualityIssue[]): ValidationStatus {
  if (account.organization.validationStatus === "blocked" || issues.some((issue) => issue.excludesFromRanking)) return "blocked";
  if (account.organization.validationStatus === "warning" || issues.length > 0) return "warning";
  return "valid";
}

export function buildSalesAgentRequest(accounts: RankedAccount[], options: { asOfDate: string; issues: DataQualityIssue[] }): SalesAgentRequest {
  // This is the privacy and authority boundary: only validated, compact facts
  // cross the API, while raw exports and score calculation remain in-browser.
  return SalesAgentRequestSchema.parse({
    as_of_date: options.asOfDate,
    accounts: accounts.map((account) => {
      const entityIssues = options.issues.filter((issue) => issue.entityName === account.organization.canonicalName);
      const uniqueIssues = [...new Map([...account.organization.issues, ...entityIssues].map((issue) => [issue.id, issue])).values()];
      return {
        account_id: account.organization.id,
        rank: account.rank,
        owner_rank: account.ownerRank,
        owner: account.organization.owner,
        account_name: account.organization.canonicalName,
        industry: account.organization.industry ?? null,
        region: account.organization.region ?? null,
        tier: account.organization.accountTier ?? null,
        arr: account.organization.arr ?? null,
        last_contact_date: account.organization.lastContactDate ?? null,
        contact_suppressed: account.organization.contactSuppressed ?? null,
        identity_resolved: account.organization.validationStatus !== "blocked",
        data_status: accountStatus(account, uniqueIssues),
        scores: {
          account_score: account.accountScore ?? null,
          intent_score: account.intentScore,
          priority_score: account.priorityScore,
          priority_band: account.priorityBand,
        },
        intent_features: {
          signal_breadth: account.intentFeatures.signalBreadth,
          total_frequency: account.intentFeatures.totalFrequency,
          latest_signal_date: account.intentFeatures.latestSignalDate ?? null,
        },
        deterministic_reason: account.reason,
        engagement_timeline: account.organization.engagements.slice(0, 20).map((signal) => ({
          event_type: signal.eventType,
          event_date: signal.eventDate,
          event_count: signal.eventCount,
          scored: signal.validationStatus !== "blocked" && signal.eventDate <= options.asOfDate,
        })),
        data_quality_flags: uniqueIssues.slice(0, 20).map((issue) => ({
          category: issue.category,
          severity: issue.severity,
          message: issue.message,
          evidence: issue.evidence,
          blocking: issue.excludesFromRanking,
        })),
      };
    }),
  });
}
