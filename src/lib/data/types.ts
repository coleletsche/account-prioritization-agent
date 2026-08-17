export const ACCOUNT_TIERS = ["SMB", "Mid-Market", "Enterprise", "Strategic"] as const;
export const EVENT_TYPES = ["email_open", "page_visit", "content_download", "webinar", "demo_request"] as const;

export type AccountTier = (typeof ACCOUNT_TIERS)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type Confidence = "high" | "medium" | "low";
export type ValidationStatus = "valid" | "warning" | "blocked";
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
  | "engagement"
  | "suppression";

export interface DataQualityIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  source: "accounts" | "engagement" | "resolution";
  rowNumber?: number;
  entityName?: string;
  organizationId?: string;
  relatedRowNumbers?: number[];
  fieldNames?: string[];
  message: string;
  evidence: string;
  recommendedAction: string;
  excludesFromRanking: boolean;
}

export interface AccountRecord {
  rowNumber: number;
  accountId?: string;
  accountName: string;
  confirmedAliases: string[];
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
  contactSuppressed?: boolean;
  validationStatus: ValidationStatus;
  issues: DataQualityIssue[];
}

export type ResolutionMatchMethod = "account_id" | "domain" | "name" | "alias";

export interface EngagementSignal {
  rowNumber: number;
  accountId?: string;
  accountName: string;
  domain?: string;
  eventType: EventType;
  eventDate: string;
  eventCount: number;
  validationStatus?: ValidationStatus;
  duplicateOfRowNumber?: number;
  matchedBy?: ResolutionMatchMethod;
}

export interface ResolvedOrganization {
  id: string;
  accountIds: string[];
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
  contactSuppressed?: boolean;
  engagements: EngagementSignal[];
  confidence: Confidence;
  validationStatus: ValidationStatus;
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
  blockedSignals: number;
  excludedOrganizations: number;
  validOrganizations: number;
  warningOrganizations: number;
  blockedOrganizations: number;
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
  value?: number;
  timing?: number;
}

export type DominantFactor = keyof FactorScores;
export type PriorityBand = "P0" | "P1" | "P2" | "P3";

export interface IntentFeatures {
  rawScore: number;
  signalBreadth: number;
  totalFrequency: number;
  latestSignalDate?: string;
}

export interface AccountFeatures {
  tierScore?: number;
  arrScore?: number;
  accountValueScore?: number;
  contactStalenessDays?: number;
  contactTimingScore?: number;
}

export interface RankedAccount {
  organization: ResolvedOrganization;
  rank: number;
  ownerRank: number;
  accountScore?: number;
  intentScore: number;
  priorityScore: number;
  priorityBand: PriorityBand;
  score: number;
  factors: FactorScores;
  accountFeatures: AccountFeatures;
  intentFeatures: IntentFeatures;
  rawIntent: number;
  dominantFactor: DominantFactor;
  reason: string;
  asOfDate: string;
  weights: ScoreWeights;
}
