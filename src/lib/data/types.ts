export const ACCOUNT_TIERS = ["SMB", "Mid-Market", "Enterprise", "Strategic"] as const;
export const EVENT_TYPES = ["email_open", "page_visit", "content_download", "webinar", "demo_request"] as const;

export type AccountTier = (typeof ACCOUNT_TIERS)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type Confidence = "high" | "medium" | "low";
export type IssueSeverity = "low" | "medium" | "high";
export type IssueCategory =
  | "schema"
  | "identity"
  | "owner"
  | "website"
  | "arr"
  | "contact_date"
  | "industry"
  | "tier"
  | "engagement";

export interface DataQualityIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  source: "accounts" | "engagement" | "resolution";
  rowNumber?: number;
  entityName?: string;
  message: string;
  evidence: string;
  recommendedAction: string;
  excludesFromRanking: boolean;
}

export interface AccountRecord {
  rowNumber: number;
  accountName: string;
  industry?: string;
  arr?: number;
  arrRaw?: string;
  lastContactDate?: string;
  accountTier?: AccountTier;
  accountTierRaw?: string;
  website: string;
  domain?: string;
  region: string;
  owner: string;
  issues: DataQualityIssue[];
}

export interface EngagementSignal {
  rowNumber: number;
  accountName: string;
  eventType: EventType;
  eventDate: string;
  eventCount: number;
}

export interface ResolvedOrganization {
  id: string;
  canonicalName: string;
  aliases: string[];
  sourceRows: number[];
  industry?: string;
  arr?: number;
  lastContactDate?: string;
  accountTier?: AccountTier;
  website?: string;
  domain?: string;
  region?: string;
  owner?: string;
  engagements: EngagementSignal[];
  confidence: Confidence;
  issues: DataQualityIssue[];
  eligible: boolean;
}

export interface ResolutionStatistics {
  sourceAccountRows: number;
  sourceSignalRows: number;
  resolvedOrganizations: number;
  duplicateDomainGroups: number;
  matchedSignals: number;
  unmatchedSignals: number;
  excludedOrganizations: number;
}

export interface EntityResolutionResult {
  organizations: ResolvedOrganization[];
  reviewQueue: DataQualityIssue[];
  statistics: ResolutionStatistics;
  latestEngagementDate?: string;
}

export interface ParsedAccounts {
  records: AccountRecord[];
  issues: DataQualityIssue[];
}

export interface ParsedEngagements {
  records: EngagementSignal[];
  issues: DataQualityIssue[];
}

export interface ScoreWeights {
  intent: number;
  value: number;
  timing: number;
}

export interface FactorScores {
  intent: number;
  value: number;
  timing: number;
}

export type DominantFactor = keyof FactorScores;

export interface RankedAccount {
  organization: ResolvedOrganization;
  rank: number;
  ownerRank: number;
  score: number;
  factors: FactorScores;
  rawIntent: number;
  dominantFactor: DominantFactor;
  reason: string;
  asOfDate: string;
  weights: ScoreWeights;
}
