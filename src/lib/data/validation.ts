import Papa from "papaparse";
import { z } from "zod";
import { ACCOUNT_TIERS, EVENT_TYPES, type AccountRecord, type DataQualityIssue, type EngagementSignal, type ParsedAccounts, type ParsedEngagements } from "./types";
import { isIsoDate, parseDomain, parseWebsiteDomain, stableId, validOrganizationName } from "./normalize";
import { validationStatusFromIssues } from "./status";

const ACCOUNT_HEADERS = ["account_name", "industry", "arr", "last_contact_date", "account_tier", "website", "region", "owner"] as const;
const ENGAGEMENT_FIELDS = ["account_name", "event_type", "event_date", "event_count"] as const;

const rawAccountSchema = z.object({
  account_id: z.string().optional().default(""),
  account_name: z.string(),
  aliases: z.string().optional().default(""),
  industry: z.string(),
  arr: z.string(),
  last_contact_date: z.string(),
  account_tier: z.string(),
  website: z.string(),
  region: z.string(),
  owner: z.string(),
  do_not_contact: z.string().optional().default(""),
});

const rawEngagementSchema = z.object({
  account_id: z.string().optional().default(""),
  account_name: z.string(),
  domain: z.string().optional().default(""),
  event_type: z.string(),
  event_date: z.string(),
  event_count: z.number(),
});

export class DataImportError extends Error {
  constructor(message: string, public readonly issues: DataQualityIssue[]) {
    super(message);
    this.name = "DataImportError";
  }
}

function issue(input: Omit<DataQualityIssue, "id">): DataQualityIssue {
  return { ...input, id: stableId("issue", JSON.stringify(input)) };
}

function parseSuppression(value: string): boolean | undefined | "invalid" {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["true", "yes", "1", "suppressed"].includes(normalized)) return true;
  if (["false", "no", "0", "clear"].includes(normalized)) return false;
  return "invalid";
}

export function parseAccountsCsv(csv: string): ParsedAccounts {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy", transformHeader: (header) => header.trim() });
  const fields = parsed.meta.fields ?? [];
  const missingHeaders = ACCOUNT_HEADERS.filter((header) => !fields.includes(header));
  if (missingHeaders.length > 0) {
    const schemaIssue = issue({
      category: "schema", severity: "high", source: "accounts",
      message: "The account export is missing required columns.",
      evidence: `Missing: ${missingHeaders.join(", ")}`,
      recommendedAction: "Export the required CRM fields and try again.", excludesFromRanking: true,
    });
    throw new DataImportError(schemaIssue.message, [schemaIssue]);
  }

  if (parsed.errors.some((error) => error.type === "Quotes" || error.type === "Delimiter")) {
    const parserIssue = issue({
      category: "schema", severity: "high", source: "accounts",
      message: "The account CSV could not be parsed reliably.",
      evidence: parsed.errors.map((error) => error.message).join("; "),
      recommendedAction: "Export a valid comma-separated file and try again.", excludesFromRanking: true,
    });
    throw new DataImportError(parserIssue.message, [parserIssue]);
  }

  const records: AccountRecord[] = [];
  const issues: DataQualityIssue[] = [];

  // Preserve usable rows and attach field-level issues instead of coercing bad
  // CRM values. Downstream scoring can omit unknowns without hiding them.
  parsed.data.forEach((raw, index) => {
    const rowNumber = index + 2;
    const result = rawAccountSchema.safeParse(raw);
    if (!result.success) {
      issues.push(issue({
        category: "schema", severity: "high", source: "accounts", rowNumber,
        message: "The account row does not match the expected export shape.", evidence: z.prettifyError(result.error),
        recommendedAction: "Correct or re-export this CRM row.", excludesFromRanking: true,
      }));
      return;
    }

    const value = result.data;
    const rowIssues: DataQualityIssue[] = [];
    const add = (input: Omit<DataQualityIssue, "id" | "source" | "rowNumber" | "entityName">) => rowIssues.push(issue({
      ...input, source: "accounts", rowNumber, entityName: value.account_name || undefined,
    }));

    if (!validOrganizationName(value.account_name)) add({
      category: "identity", severity: "high", message: "Account name is not a recognizable organization name.",
      evidence: value.account_name || "Blank value", recommendedAction: "Replace it with the legal or commonly used organization name.", excludesFromRanking: true,
    });

    const domain = parseWebsiteDomain(value.website);
    if (!domain) add({
      category: "website", severity: "medium", message: "Website is missing or invalid.",
      evidence: value.website || "Blank value", recommendedAction: "Add the organization’s canonical HTTP(S) website.", excludesFromRanking: false,
    });

    let arr: number | undefined;
    if (value.arr.trim()) {
      const candidate = Number(value.arr);
      if (!Number.isFinite(candidate) || candidate < 0) add({
        category: "arr", severity: "medium", message: "ARR cannot be used as an account-value signal.",
        evidence: value.arr, recommendedAction: "Replace it with a nonnegative numeric value or leave it blank.", excludesFromRanking: false,
      });
      else {
        arr = candidate;
        if (candidate > 1_000_000_000) add({
          category: "arr", severity: "medium", message: "ARR is unusually large and should be confirmed.",
          evidence: value.arr, recommendedAction: "Confirm the ARR unit and currency in the CRM before relying on account value.", excludesFromRanking: false,
        });
      }
    } else add({
      category: "arr", severity: "low", message: "ARR is missing.", evidence: "Blank value",
      recommendedAction: "Confirm the CRM value definition and populate it when available.", excludesFromRanking: false,
    });

    const contactDate = value.last_contact_date.trim();
    if (contactDate && !isIsoDate(contactDate)) add({
      category: "contact_date", severity: "medium", message: "Last-contact date is invalid.", evidence: contactDate,
      recommendedAction: "Use an ISO date in YYYY-MM-DD format.", excludesFromRanking: false,
    });
    if (!contactDate) add({
      category: "contact_date", severity: "low", message: "Last-contact date is missing.", evidence: "Blank value",
      recommendedAction: "Sync or enter the most recent meaningful sales contact.", excludesFromRanking: false,
    });

    const accountTier = ACCOUNT_TIERS.find((tier) => tier === value.account_tier.trim());
    if (!accountTier) add({
      category: "tier", severity: "medium", message: "Account tier is missing or unsupported.", evidence: value.account_tier || "Blank value",
      recommendedAction: "Classify the account as SMB, Mid-Market, Enterprise, or Strategic.", excludesFromRanking: false,
    });
    if (!value.industry.trim()) add({
      category: "industry", severity: "low", message: "Industry is missing.", evidence: "Blank value",
      recommendedAction: "Add an industry for filtering and later ICP analysis.", excludesFromRanking: false,
    });
    if (!value.owner.trim()) add({
      category: "owner", severity: "high", message: "Account owner is missing.", evidence: "Blank value",
      recommendedAction: "Assign an SDR owner before weekly prioritization.", excludesFromRanking: true,
    });

    const aliases = value.aliases.split(/[|;]/).map((alias) => alias.trim()).filter(Boolean);
    const invalidAliases = aliases.filter((alias) => !validOrganizationName(alias));
    if (invalidAliases.length > 0) add({
      category: "identity", severity: "medium", message: "One or more CRM aliases are invalid.",
      evidence: invalidAliases.join(" | "), recommendedAction: "Remove invalid aliases or replace them with confirmed organization names.", excludesFromRanking: false,
    });

    const suppression = parseSuppression(value.do_not_contact);
    if (suppression === "invalid") add({
      category: "suppression", severity: "high", message: "Contact-suppression status is invalid.",
      evidence: value.do_not_contact, recommendedAction: "Use true/false, yes/no, 1/0, suppressed, or clear.", excludesFromRanking: true,
    });

    const record: AccountRecord = {
      rowNumber,
      accountId: value.account_id.trim() || undefined,
      accountName: value.account_name.trim(),
      confirmedAliases: aliases.filter((alias) => validOrganizationName(alias)),
      industry: value.industry.trim() || undefined,
      arr,
      arrRaw: value.arr.trim() || undefined,
      lastContactDate: contactDate && isIsoDate(contactDate) ? contactDate : undefined,
      accountTier,
      accountTierRaw: value.account_tier.trim() || undefined,
      website: value.website.trim(),
      domain,
      region: value.region.trim(),
      owner: value.owner.trim(),
      contactSuppressed: typeof suppression === "boolean" ? suppression : undefined,
      validationStatus: validationStatusFromIssues(rowIssues),
      issues: rowIssues,
    };
    records.push(record);
    issues.push(...rowIssues);
  });

  return { records, issues };
}

export function parseEngagementJson(json: string): ParsedEngagements {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    const schemaIssue = issue({
      category: "schema", severity: "high", source: "engagement", message: "The engagement export is not valid JSON.",
      evidence: "JSON parsing failed", recommendedAction: "Export a valid JSON array and try again.", excludesFromRanking: true,
    });
    throw new DataImportError(schemaIssue.message, [schemaIssue]);
  }
  if (!Array.isArray(input)) {
    const schemaIssue = issue({
      category: "schema", severity: "high", source: "engagement", message: "The engagement export must be a JSON array.",
      evidence: `Received ${typeof input}`, recommendedAction: "Export one object per engagement signal in an array.", excludesFromRanking: true,
    });
    throw new DataImportError(schemaIssue.message, [schemaIssue]);
  }

  const records: EngagementSignal[] = [];
  const issues: DataQualityIssue[] = [];
  input.forEach((raw, index) => {
    const rowNumber = index + 1;
    const result = rawEngagementSchema.safeParse(raw);
    if (!result.success || !ENGAGEMENT_FIELDS.every((field) => typeof raw === "object" && raw !== null && field in raw)) {
      issues.push(issue({
        category: "schema", severity: "high", source: "engagement", rowNumber,
        message: "The engagement row does not match the expected export shape.", evidence: result.success ? "Missing required field" : z.prettifyError(result.error),
        recommendedAction: "Correct or re-export this engagement row.", excludesFromRanking: true,
      }));
      return;
    }
    const value = result.data;
    const eventType = EVENT_TYPES.find((event) => event === value.event_type);
    if (!eventType || !isIsoDate(value.event_date) || !Number.isInteger(value.event_count) || value.event_count <= 0) {
      // Unscoreable events remain represented by a review issue; assigning a
      // default type, date, or count would manufacture intent evidence.
      const evidence = !eventType ? `Unknown event type: ${value.event_type}` : !isIsoDate(value.event_date) ? `Invalid date: ${value.event_date}` : `Invalid count: ${value.event_count}`;
      issues.push(issue({
        category: "engagement", severity: "medium", source: "engagement", rowNumber, entityName: value.account_name,
        message: "Engagement signal cannot be scored.", evidence,
        recommendedAction: "Use a supported event, ISO date, and positive whole-number count.", excludesFromRanking: false,
      }));
      return;
    }
    const domain = parseDomain(value.domain);
    if (value.domain.trim() && !domain) {
      issues.push(issue({
        category: "identity", severity: "medium", source: "engagement", rowNumber, entityName: value.account_name,
        message: "Engagement domain is invalid and cannot be used for identity matching.", evidence: value.domain,
        recommendedAction: "Use a valid hostname or provide the stable CRM account ID.", excludesFromRanking: false,
      }));
    }
    records.push({
      rowNumber,
      accountId: value.account_id.trim() || undefined,
      accountName: value.account_name.trim(),
      domain,
      eventType,
      eventDate: value.event_date,
      eventCount: value.event_count,
      validationStatus: "valid",
    });
  });
  return { records, issues };
}
