import Papa from "papaparse";
import { ACCOUNT_TIERS, EVENT_TYPES, isIsoDate, parseDomain, parseWebsiteDomain, processCrmExports, validOrganizationName, type DataQualityIssue, type EntityResolutionResult } from "./data";

export interface DatasetSources {
  accountsCsv: string;
  engagementsJson: string;
}

export interface AppliedCorrection {
  id: string;
  summary: string;
  source: "accounts" | "engagement" | "resolution";
  rowNumbers: number[];
}

export interface DatasetSession {
  originalSources: DatasetSources;
  workingSources: DatasetSources;
  data: EntityResolutionResult;
  corrections: AppliedCorrection[];
}

export type AccountSourceRow = Record<string, string>;
export type EngagementSourceRow = Record<string, unknown>;

export type ReconciliationAction =
  | { kind: "edit_account"; rowNumber: number; changes: Record<string, string> }
  | { kind: "edit_engagement"; rowNumber: number; changes: Record<string, string | number> }
  | { kind: "confirm_alias"; engagementRowNumber: number; organizationId: string }
  | { kind: "remove_engagement"; rowNumber: number }
  | { kind: "resolve_account_conflict"; organizationId: string; rowNumbers: number[]; changes: Record<string, string> };

export interface ReconciliationGroup {
  id: string;
  title: string;
  organizationId?: string;
  accountRowNumbers: number[];
  engagementRowNumbers: number[];
  issues: DataQualityIssue[];
  severity: DataQualityIssue["severity"];
  source: "accounts" | "engagement" | "resolution";
  heldOut: boolean;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function copySources(sources: DatasetSources): DatasetSources {
  return { accountsCsv: sources.accountsCsv, engagementsJson: sources.engagementsJson };
}

function parseAccountSource(csv: string): { fields: string[]; rows: AccountSourceRow[] } {
  const parsed = Papa.parse<AccountSourceRow>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.some((error) => error.type === "Quotes" || error.type === "Delimiter")) {
    throw new Error("The working account CSV could not be parsed reliably.");
  }
  return { fields: parsed.meta.fields ?? [], rows: parsed.data };
}

function serializeAccountSource(fields: string[], rows: AccountSourceRow[]): string {
  return Papa.unparse({ fields, data: rows }, { newline: "\n" });
}

function parseEngagementSource(json: string): EngagementSourceRow[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) throw new Error("The working engagement export must be a JSON array.");
  return value as EngagementSourceRow[];
}

function serializeEngagementSource(rows: EngagementSourceRow[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

function correctionId(index: number, action: ReconciliationAction): string {
  const rows = "rowNumber" in action ? [action.rowNumber] : "rowNumbers" in action ? action.rowNumbers : [action.engagementRowNumber];
  return `correction-${index + 1}-${action.kind}-${rows.join("-")}`;
}

function actionSummary(action: ReconciliationAction, session: DatasetSession): string {
  if (action.kind === "remove_engagement") return `Removed duplicate engagement row ${action.rowNumber}`;
  if (action.kind === "confirm_alias") {
    const organization = session.data.organizations.find((candidate) => candidate.id === action.organizationId);
    return `Confirmed engagement row ${action.engagementRowNumber} as an alias of ${organization?.canonicalName ?? "an organization"}`;
  }
  if (action.kind === "resolve_account_conflict") return `Reconciled account rows ${action.rowNumbers.join(", ")}`;
  return `Updated ${action.kind === "edit_account" ? "account" : "engagement"} row ${action.rowNumber}`;
}

function actionSource(action: ReconciliationAction): AppliedCorrection["source"] {
  if (action.kind === "edit_account") return "accounts";
  if (action.kind === "resolve_account_conflict" || action.kind === "confirm_alias") return "resolution";
  return "engagement";
}

function actionRows(action: ReconciliationAction): number[] {
  if ("rowNumber" in action) return [action.rowNumber];
  if ("rowNumbers" in action) return action.rowNumbers;
  return [action.engagementRowNumber];
}

function addFields(fields: string[], values: Record<string, unknown>): string[] {
  const next = [...fields];
  for (const key of Object.keys(values)) if (!next.includes(key)) next.push(key);
  return next;
}

function validateAccountChanges(changes: Record<string, string>): void {
  if (changes.account_name !== undefined && !validOrganizationName(changes.account_name)) throw new Error("Account name must contain a recognizable organization name.");
  if (changes.arr?.trim() && (!Number.isFinite(Number(changes.arr)) || Number(changes.arr) < 0)) throw new Error("ARR must be a nonnegative number or blank.");
  if (changes.last_contact_date?.trim() && !isIsoDate(changes.last_contact_date)) throw new Error("Last contact must use a valid YYYY-MM-DD date.");
  if (changes.account_tier?.trim() && !ACCOUNT_TIERS.some((tier) => tier === changes.account_tier)) throw new Error("Account tier must use one of the supported values.");
  if (changes.website?.trim() && !parseWebsiteDomain(changes.website)) throw new Error("Website must be a valid HTTP(S) organization URL.");
  if (changes.owner !== undefined && !changes.owner.trim()) throw new Error("Owner cannot be blank when it is edited.");
  if (changes.aliases !== undefined) {
    const invalidAlias = changes.aliases.split(/[|;]/).map((alias) => alias.trim()).filter(Boolean).find((alias) => !validOrganizationName(alias));
    if (invalidAlias) throw new Error(`Alias “${invalidAlias}” is not a recognizable organization name.`);
  }
  if (changes.do_not_contact?.trim() && !["true", "false", "yes", "no", "1", "0", "suppressed", "clear"].includes(changes.do_not_contact.trim().toLowerCase())) {
    throw new Error("Contact suppression must be clear, suppressed, true, false, yes, no, 1, 0, or blank.");
  }
}

function editAccountRows(
  source: { fields: string[]; rows: AccountSourceRow[] },
  rowNumbers: number[],
  changes: Record<string, string>,
): { fields: string[]; rows: AccountSourceRow[] } {
  validateAccountChanges(changes);
  const indexes = rowNumbers.map((rowNumber) => rowNumber - 2);
  if (indexes.some((index) => index < 0 || index >= source.rows.length)) throw new Error("The selected account row no longer exists.");
  const indexSet = new Set(indexes);
  return {
    fields: addFields(source.fields, changes),
    rows: source.rows.map((row, index) => indexSet.has(index) ? { ...row, ...changes } : row),
  };
}

function editEngagementRow(rows: EngagementSourceRow[], rowNumber: number, changes: Record<string, string | number>): EngagementSourceRow[] {
  const index = rowNumber - 1;
  if (index < 0 || index >= rows.length) throw new Error("The selected engagement row no longer exists.");
  const nextRow: EngagementSourceRow = { ...(rows[index] as EngagementSourceRow), ...changes };
  nextRow.event_count = Number(nextRow.event_count);
  if (typeof nextRow.account_name !== "string" || !validOrganizationName(nextRow.account_name)) throw new Error("Engagement account name must contain a recognizable organization name.");
  if (typeof nextRow.event_type !== "string" || !EVENT_TYPES.some((eventType) => eventType === nextRow.event_type)) throw new Error("Choose a supported engagement event type.");
  if (typeof nextRow.event_date !== "string" || !isIsoDate(nextRow.event_date)) throw new Error("Engagement date must use a valid YYYY-MM-DD date.");
  if (!Number.isInteger(Number(nextRow.event_count)) || Number(nextRow.event_count) <= 0) throw new Error("Event count must be a positive whole number.");
  if (typeof nextRow.domain === "string" && nextRow.domain.trim() && !parseDomain(nextRow.domain)) throw new Error("Engagement domain must be a valid hostname.");
  return rows.map((row, rowIndex) => rowIndex === index ? nextRow : row);
}

export function createDatasetSession(sources: DatasetSources): DatasetSession {
  // Keep immutable uploaded values beside a mutable working copy so every edit
  // is reversible without touching the user's local CRM export.
  const originalSources = copySources(sources);
  return {
    originalSources,
    workingSources: copySources(sources),
    data: processCrmExports(sources.accountsCsv, sources.engagementsJson),
    corrections: [],
  };
}

export function resetDatasetSession(session: DatasetSession): DatasetSession {
  return createDatasetSession(session.originalSources);
}

export function getAccountSource(session: DatasetSession): { fields: string[]; rows: AccountSourceRow[] } {
  return parseAccountSource(session.workingSources.accountsCsv);
}

export function getEngagementSource(session: DatasetSession): EngagementSourceRow[] {
  return parseEngagementSource(session.workingSources.engagementsJson);
}

export function applyReconciliationAction(session: DatasetSession, action: ReconciliationAction): DatasetSession {
  // Apply to cloned source rows first, then rebuild validation, resolution, and
  // cohort scoring inputs from text. A thrown validation error leaves the prior
  // session object—and therefore the published ranking—unchanged.
  let accounts = parseAccountSource(session.workingSources.accountsCsv);
  let engagements = parseEngagementSource(session.workingSources.engagementsJson);

  if (action.kind === "edit_account") accounts = editAccountRows(accounts, [action.rowNumber], action.changes);
  if (action.kind === "resolve_account_conflict") accounts = editAccountRows(accounts, action.rowNumbers, action.changes);
  if (action.kind === "edit_engagement") engagements = editEngagementRow(engagements, action.rowNumber, action.changes);
  if (action.kind === "remove_engagement") {
    const index = action.rowNumber - 1;
    if (index < 0 || index >= engagements.length) throw new Error("The selected engagement row no longer exists.");
    engagements = engagements.filter((_, rowIndex) => rowIndex !== index);
  }
  if (action.kind === "confirm_alias") {
    // Alias confirmation is an explicit VP decision recorded in the account
    // source. The normal resolver must still prove the match is unambiguous.
    const organization = session.data.organizations.find((candidate) => candidate.id === action.organizationId);
    const engagement = engagements[action.engagementRowNumber - 1];
    if (!organization || !engagement) throw new Error("The selected identity record no longer exists.");
    const accountRow = organization.sourceRows[0];
    const rawAccount = accounts.rows[accountRow - 2];
    const alias = typeof engagement.account_name === "string" ? engagement.account_name.trim() : "";
    if (!rawAccount || !validOrganizationName(alias)) throw new Error("A valid engagement account name is required before confirming an alias.");
    const aliases = String(rawAccount.aliases ?? "").split(/[|;]/).map((value) => value.trim()).filter(Boolean);
    if (!aliases.includes(alias)) aliases.push(alias);
    accounts = editAccountRows(accounts, [accountRow], { aliases: aliases.join(" | ") });
  }

  const workingSources = {
    accountsCsv: serializeAccountSource(accounts.fields, accounts.rows),
    engagementsJson: serializeEngagementSource(engagements),
  };
  const data = processCrmExports(workingSources.accountsCsv, workingSources.engagementsJson);
  if (action.kind === "confirm_alias") {
    const matched = data.organizations.some((organization) => organization.engagements.some((engagement) => engagement.rowNumber === action.engagementRowNumber));
    if (!matched) throw new Error("That alias is still ambiguous. Correct the source identity fields before saving it.");
  }

  return {
    ...session,
    workingSources,
    data,
    corrections: [...session.corrections, {
      id: correctionId(session.corrections.length, action),
      summary: actionSummary(action, session),
      source: actionSource(action),
      rowNumbers: actionRows(action),
    }],
  };
}

export function buildReconciliationGroups(data: EntityResolutionResult, issues: DataQualityIssue[]): ReconciliationGroup[] {
  const organizationsById = new Map(data.organizations.map((organization) => [organization.id, organization]));
  const organizationsByRow = new Map<number, EntityResolutionResult["organizations"][number]>();
  const organizationsByEngagementRow = new Map<number, EntityResolutionResult["organizations"][number]>();
  for (const organization of data.organizations) {
    for (const rowNumber of organization.sourceRows) organizationsByRow.set(rowNumber, organization);
    for (const engagement of organization.engagements) organizationsByEngagementRow.set(engagement.rowNumber, organization);
  }

  const groups = new Map<string, ReconciliationGroup>();
  for (const issue of issues) {
    const accountOrganization = issue.source === "accounts" && issue.rowNumber ? organizationsByRow.get(issue.rowNumber) : undefined;
    const engagementOrganization = issue.source === "engagement" && issue.rowNumber ? organizationsByEngagementRow.get(issue.rowNumber) : undefined;
    const organization = (issue.organizationId ? organizationsById.get(issue.organizationId) : undefined) ?? accountOrganization ?? engagementOrganization;
    const accountTarget = issue.source === "accounts" || (issue.source === "resolution" && Boolean(organization) && issue.category !== "engagement");
    const engagementTarget = !accountTarget && issue.rowNumber !== undefined;
    const key = accountTarget && organization
      ? `organization:${organization.id}`
      : engagementTarget
        ? `engagement:${issue.rowNumber}`
        : issue.organizationId
          ? `organization:${issue.organizationId}`
          : `issue:${issue.id}`;
    const existing = groups.get(key);
    const source = accountTarget ? "accounts" : engagementTarget ? "engagement" : "resolution";
    const accountRows = accountTarget ? (organization?.sourceRows ?? issue.relatedRowNumbers ?? (issue.rowNumber ? [issue.rowNumber] : [])) : [];
    const engagementRows = engagementTarget && issue.rowNumber ? [issue.rowNumber] : [];
    if (existing) {
      existing.issues.push(issue);
      existing.accountRowNumbers = [...new Set([...existing.accountRowNumbers, ...accountRows])].sort((a, b) => a - b);
      existing.engagementRowNumbers = [...new Set([...existing.engagementRowNumbers, ...engagementRows])].sort((a, b) => a - b);
      if (SEVERITY_ORDER[issue.severity] < SEVERITY_ORDER[existing.severity]) existing.severity = issue.severity;
      existing.heldOut ||= issue.excludesFromRanking;
      continue;
    }
    groups.set(key, {
      id: key,
      title: organization?.canonicalName ?? issue.entityName ?? `${source === "accounts" ? "Account" : source === "engagement" ? "Engagement" : "Review item"} row ${issue.rowNumber ?? ""}`.trim(),
      organizationId: organization?.id ?? issue.organizationId,
      accountRowNumbers: [...new Set(accountRows)].sort((a, b) => a - b),
      engagementRowNumbers: [...new Set(engagementRows)].sort((a, b) => a - b),
      issues: [issue],
      severity: issue.severity,
      source,
      heldOut: issue.excludesFromRanking,
    });
  }

  return [...groups.values()].sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || left.title.localeCompare(right.title));
}
