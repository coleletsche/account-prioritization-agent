import type { AccountTier, DominantFactor, EngagementSignal, FactorScores, RankedAccount, ResolvedOrganization, ScoreWeights } from "./data/types";
import { isIsoDate } from "./data/normalize";

export const DEFAULT_WEIGHTS: ScoreWeights = { intent: 55, value: 30, timing: 15 };

export const EVENT_WEIGHTS: Record<EngagementSignal["eventType"], number> = {
  demo_request: 10,
  webinar: 6,
  content_download: 5,
  page_visit: 2,
  email_open: 1,
};

export const TIER_VALUES: Record<AccountTier, number> = {
  Strategic: 100,
  Enterprise: 85,
  "Mid-Market": 55,
  SMB: 25,
};

const DAY_MS = 86_400_000;

function dateAtUtc(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

export function daysBetween(from: string, to: string): number {
  return Math.floor((dateAtUtc(to) - dateAtUtc(from)) / DAY_MS);
}

export function calculateIntentRaw(engagements: EngagementSignal[], asOfDate: string): number {
  return engagements.reduce((total, signal) => {
    const ageDays = daysBetween(signal.eventDate, asOfDate);
    if (ageDays < 0) return total;
    const decay = 2 ** (-ageDays / 30);
    return total + EVENT_WEIGHTS[signal.eventType] * Math.log1p(signal.eventCount) * decay;
  }, 0);
}

export function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

export function normalizeToP95(value: number, p95: number): number {
  if (p95 <= 0) return 0;
  return Math.min(100, Math.max(0, (value / p95) * 100));
}

export function calculateValueScore(organization: ResolvedOrganization, arrP95: number): number {
  const tierScore = organization.accountTier ? TIER_VALUES[organization.accountTier] : undefined;
  const arrScore = organization.arr === undefined ? undefined : normalizeToP95(organization.arr, arrP95);
  if (tierScore !== undefined && arrScore !== undefined) return tierScore * 0.65 + arrScore * 0.35;
  if (tierScore !== undefined) return tierScore;
  if (arrScore !== undefined) return arrScore;
  return 50;
}

export function calculateTimingScore(lastContactDate: string | undefined, asOfDate: string): number {
  if (!lastContactDate || !isIsoDate(lastContactDate)) return 50;
  const ageDays = daysBetween(lastContactDate, asOfDate);
  if (ageDays < 0) return 50;
  return Math.min(100, (ageDays / 90) * 100);
}

export function validateWeights(weights: ScoreWeights): ScoreWeights {
  const values = [weights.intent, weights.value, weights.timing];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) throw new Error("Score weights must be between 0 and 100.");
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) > 0.001) throw new Error("Score weights must total 100.");
  return weights;
}

export function redistributeWeights(current: ScoreWeights, changed: keyof ScoreWeights, nextValue: number): ScoreWeights {
  const clamped = Math.round(Math.min(100, Math.max(0, nextValue)));
  const otherKeys = (Object.keys(current) as Array<keyof ScoreWeights>).filter((key) => key !== changed);
  const remaining = 100 - clamped;
  const previousOtherTotal = otherKeys.reduce((sum, key) => sum + current[key], 0);
  let first = previousOtherTotal === 0 ? Math.round(remaining / 2) : Math.round((current[otherKeys[0]] / previousOtherTotal) * remaining);
  first = Math.min(remaining, Math.max(0, first));
  return { ...current, [changed]: clamped, [otherKeys[0]]: first, [otherKeys[1]]: remaining - first };
}

function dominantFactor(factors: FactorScores, weights: ScoreWeights): DominantFactor {
  return (Object.keys(factors) as DominantFactor[]).sort((a, b) => factors[b] * weights[b] - factors[a] * weights[a])[0];
}

function reasonFor(organization: ResolvedOrganization, factors: FactorScores, dominant: DominantFactor): string {
  if (dominant === "intent") {
    const strongest = [...organization.engagements].sort((a, b) => EVENT_WEIGHTS[b.eventType] - EVENT_WEIGHTS[a.eventType] || b.eventDate.localeCompare(a.eventDate))[0];
    if (strongest) return `${strongest.eventType.replaceAll("_", " ")} activity is the strongest priority signal.`;
    return "Engagement intent is the largest weighted factor.";
  }
  if (dominant === "value") {
    return organization.accountTier ? `${organization.accountTier} tier and available ARR make account value the leading factor.` : "Available ARR makes account value the leading factor.";
  }
  if (!organization.lastContactDate) return "Missing contact history creates a neutral timing signal that should be reviewed.";
  return `${Math.max(0, Math.round(factors.timing * 0.9))} days since the last valid contact makes timing the leading factor.`;
}

export function rankOrganizations(
  organizations: ResolvedOrganization[],
  options: { asOfDate: string; weights?: ScoreWeights },
): RankedAccount[] {
  if (!isIsoDate(options.asOfDate)) throw new Error("The scoring date must use YYYY-MM-DD.");
  const weights = validateWeights(options.weights ?? DEFAULT_WEIGHTS);
  const eligible = organizations.filter((organization) => organization.eligible && organization.owner);
  const rawIntent = new Map(eligible.map((organization) => [organization.id, calculateIntentRaw(organization.engagements, options.asOfDate)]));
  const intentP95 = percentile95([...rawIntent.values()]);
  const arrP95 = percentile95(eligible.map((organization) => organization.arr).filter((value): value is number => value !== undefined));

  const scored = eligible.map((organization) => {
    const raw = rawIntent.get(organization.id) ?? 0;
    const factors: FactorScores = {
      intent: normalizeToP95(raw, intentP95),
      value: calculateValueScore(organization, arrP95),
      timing: calculateTimingScore(organization.lastContactDate, options.asOfDate),
    };
    const score = (factors.intent * weights.intent + factors.value * weights.value + factors.timing * weights.timing) / 100;
    const dominant = dominantFactor(factors, weights);
    return { organization, factors, rawIntent: raw, score, dominantFactor: dominant, reason: reasonFor(organization, factors, dominant) };
  });

  scored.sort((a, b) => b.score - a.score || b.factors.intent - a.factors.intent || b.factors.value - a.factors.value || a.organization.canonicalName.localeCompare(b.organization.canonicalName));
  const ownerCounts = new Map<string, number>();
  return scored.map((account, index) => {
    const owner = account.organization.owner as string;
    const ownerRank = (ownerCounts.get(owner) ?? 0) + 1;
    ownerCounts.set(owner, ownerRank);
    return { ...account, rank: index + 1, ownerRank, asOfDate: options.asOfDate, weights: { ...weights } };
  });
}
