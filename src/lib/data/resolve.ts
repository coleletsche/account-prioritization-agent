import { compareIsoDates, normalizeOrganizationName, stableId } from "./normalize";
import { parseAccountsCsv, parseEngagementJson } from "./validation";
import type { AccountRecord, DataQualityIssue, EngagementSignal, EntityResolutionResult, ResolvedOrganization } from "./types";

function uniqueNonEmpty<T>(values: Array<T | undefined | "">): T[] {
  return [...new Set(values.filter((value): value is T => value !== undefined && value !== ""))];
}

function resolutionIssue(input: Omit<DataQualityIssue, "id" | "source">): DataQualityIssue {
  return { ...input, source: "resolution", id: stableId("issue", JSON.stringify(input)) };
}

function fieldsConflict(records: AccountRecord[]): string[] {
  const fields: Array<[string, (record: AccountRecord) => string | undefined]> = [
    ["owner", (record) => record.owner],
    ["tier", (record) => record.accountTier],
    ["region", (record) => record.region],
    ["industry", (record) => record.industry],
  ];
  return fields.filter(([, get]) => uniqueNonEmpty(records.map(get)).length > 1).map(([label]) => label);
}

function selectCanonical(records: AccountRecord[]): AccountRecord {
  return [...records].sort((a, b) => {
    const date = compareIsoDates(b.lastContactDate, a.lastContactDate);
    if (date !== 0) return date;
    return b.accountName.length - a.accountName.length || a.accountName.localeCompare(b.accountName);
  })[0];
}

function buildOrganization(key: string, records: AccountRecord[]): ResolvedOrganization {
  const primary = selectCanonical(records);
  const conflicts = fieldsConflict(records);
  const issues = records.flatMap((record) => record.issues);
  if (conflicts.length > 0) {
    issues.push(resolutionIssue({
      category: conflicts.includes("owner") ? "owner" : "identity", severity: "high", entityName: primary.accountName,
      message: "Potential duplicate records disagree on important CRM fields.",
      evidence: `Conflicting fields: ${conflicts.join(", ")}`,
      recommendedAction: "Review the CRM records and select the canonical organization values.", excludesFromRanking: true,
    }));
  }

  const aliases = [...new Set(records.map((record) => record.accountName))].sort((a, b) => a.localeCompare(b));
  const allArr = records.map((record) => record.arr).filter((value): value is number => value !== undefined);
  const dates = records.map((record) => record.lastContactDate).filter((value): value is string => value !== undefined).sort();
  const excluded = conflicts.length > 0 || issues.some((item) => item.excludesFromRanking);
  const confidence = excluded ? "low" : issues.length > 0 ? "medium" : "high";

  return {
    id: stableId("org", key),
    canonicalName: primary.accountName,
    aliases,
    sourceRows: records.map((record) => record.rowNumber).sort((a, b) => a - b),
    industry: primary.industry ?? uniqueNonEmpty(records.map((record) => record.industry))[0],
    arr: allArr.length > 0 ? Math.max(...allArr) : undefined,
    lastContactDate: dates.at(-1),
    accountTier: primary.accountTier ?? uniqueNonEmpty(records.map((record) => record.accountTier))[0],
    website: primary.domain ? primary.website : records.find((record) => record.domain)?.website,
    domain: primary.domain ?? records.find((record) => record.domain)?.domain,
    region: primary.region || uniqueNonEmpty(records.map((record) => record.region))[0],
    owner: primary.owner || uniqueNonEmpty(records.map((record) => record.owner))[0],
    engagements: [],
    confidence,
    issues,
    eligible: !excluded,
  };
}

export function resolveOrganizations(accounts: AccountRecord[], engagements: EngagementSignal[], parserIssues: DataQualityIssue[] = []): EntityResolutionResult {
  const groups = new Map<string, AccountRecord[]>();
  for (const record of accounts) {
    const nameKey = normalizeOrganizationName(record.accountName);
    const key = record.domain ? `domain:${record.domain}` : `name:${nameKey || `row-${record.rowNumber}`}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const organizations = [...groups.entries()].map(([key, records]) => buildOrganization(key, records));
  const aliases = new Map<string, ResolvedOrganization[]>();
  for (const organization of organizations) {
    for (const name of organization.aliases) {
      const normalized = normalizeOrganizationName(name);
      if (!normalized) continue;
      aliases.set(normalized, [...(aliases.get(normalized) ?? []), organization]);
    }
  }

  const resolutionIssues: DataQualityIssue[] = [];
  let matchedSignals = 0;
  for (const engagement of engagements) {
    const candidates = aliases.get(normalizeOrganizationName(engagement.accountName)) ?? [];
    if (candidates.length === 1) {
      candidates[0].engagements.push(engagement);
      matchedSignals += 1;
      continue;
    }
    resolutionIssues.push(resolutionIssue({
      category: "identity", severity: "high", rowNumber: engagement.rowNumber, entityName: engagement.accountName,
      message: candidates.length === 0 ? "Engagement account could not be matched." : "Engagement account matched more than one organization.",
      evidence: candidates.length === 0 ? engagement.accountName : candidates.map((candidate) => candidate.canonicalName).join(", "),
      recommendedAction: "Add a stable CRM account ID to both exports or correct the account name.", excludesFromRanking: true,
    }));
  }

  for (const organization of organizations) {
    organization.engagements.sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.eventType.localeCompare(b.eventType));
  }

  organizations.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  const reviewQueue = [...parserIssues, ...organizations.flatMap((organization) => organization.issues), ...resolutionIssues];
  const dates = engagements.map((engagement) => engagement.eventDate).sort();
  return {
    organizations,
    reviewQueue,
    statistics: {
      sourceAccountRows: accounts.length,
      sourceSignalRows: engagements.length + parserIssues.filter((item) => item.source === "engagement").length,
      resolvedOrganizations: organizations.length,
      duplicateDomainGroups: [...groups.entries()].filter(([key, records]) => key.startsWith("domain:") && records.length > 1).length,
      matchedSignals,
      unmatchedSignals: engagements.length - matchedSignals,
      excludedOrganizations: organizations.filter((organization) => !organization.eligible).length,
    },
    latestEngagementDate: dates.at(-1),
  };
}

export function processCrmExports(accountsCsv: string, engagementsJson: string): EntityResolutionResult {
  const accounts = parseAccountsCsv(accountsCsv);
  const engagements = parseEngagementJson(engagementsJson);
  return resolveOrganizations(accounts.records, engagements.records, [
    ...accounts.issues.filter((item) => item.category === "schema"),
    ...engagements.issues,
  ]);
}
