import Papa from "papaparse";
import type { DataQualityIssue, RankedAccount, ScoreWeights } from "./data";

function safeCell(value: string | number | undefined): string | number {
  if (value === undefined) return "";
  if (typeof value === "number") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function buildRankingCsv(accounts: RankedAccount[], options: { asOfDate: string; weights: ScoreWeights; reviewIssues?: DataQualityIssue[] }): string {
  const rows = accounts.map((account) => {
    const organization = account.organization;
    const runtimeWarnings = (options.reviewIssues ?? []).filter((issue) => issue.entityName === organization.canonicalName && !organization.issues.some((existing) => existing.id === issue.id));
    const warnings = [...organization.issues, ...runtimeWarnings].map((issue) => `${issue.message} ${issue.evidence}`).join(" | ");
    const latest = organization.engagements[0];
    return {
      rank: account.rank,
      owner_rank: account.ownerRank,
      account: safeCell(organization.canonicalName),
      aliases: safeCell(organization.aliases.join(" | ")),
      website: safeCell(organization.website),
      owner: safeCell(organization.owner),
      tier: safeCell(organization.accountTier),
      region: safeCell(organization.region),
      industry: safeCell(organization.industry),
      confidence: organization.confidence,
      priority_score: account.score.toFixed(2),
      intent_score: account.factors.intent.toFixed(2),
      account_value_score: account.factors.value.toFixed(2),
      contact_timing_score: account.factors.timing.toFixed(2),
      dominant_factor: account.dominantFactor,
      reason: safeCell(account.reason),
      raw_intent: account.rawIntent.toFixed(4),
      last_contact_date: organization.lastContactDate ?? "",
      latest_engagement_type: latest?.eventType ?? "",
      latest_engagement_date: latest?.eventDate ?? "",
      warnings: safeCell(warnings),
      intent_weight: options.weights.intent,
      account_value_weight: options.weights.value,
      contact_timing_weight: options.weights.timing,
      as_of_date: options.asOfDate,
    };
  });

  return Papa.unparse(rows, { newline: "\n" });
}

export function rankingFilename(asOfDate: string): string {
  return `velora-account-priority-${asOfDate}.csv`;
}
