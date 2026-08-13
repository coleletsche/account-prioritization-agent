import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DataImportError, normalizeOrganizationName, parseAccountsCsv, parseEngagementJson, processCrmExports } from ".";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "public/sample-data", name), "utf8");

describe("CRM validation and entity resolution", () => {
  it("reconciles the supplied assessment data without silent row loss", () => {
    const result = processCrmExports(fixture("accounts.csv"), fixture("engagement_signals.json"));
    expect(result.statistics).toMatchObject({
      sourceAccountRows: 300,
      sourceSignalRows: 360,
      resolvedOrganizations: 286,
      duplicateDomainGroups: 14,
      matchedSignals: 360,
      unmatchedSignals: 0,
    });
    expect(result.organizations.reduce((sum, organization) => sum + organization.engagements.length, 0)).toBe(360);
  });

  it("matches documented abbreviations without fuzzy guessing", () => {
    expect(normalizeOrganizationName("Electronic Frontier Fdn.")).toBe(normalizeOrganizationName("Electronic Frontier Foundation"));
    expect(normalizeOrganizationName("Teach For Amer.")).toBe(normalizeOrganizationName("Teach For America"));
    expect(normalizeOrganizationName("Amnesty International, Incorporated")).toBe(normalizeOrganizationName("Amnesty International"));
  });

  it("rejects account files with missing required headers", () => {
    expect(() => parseAccountsCsv("account_name,owner\nAcme,Rep A")).toThrow(DataImportError);
  });

  it("rejects malformed engagement JSON", () => {
    expect(() => parseEngagementJson("{not-json}")).toThrow(DataImportError);
  });

  it("keeps unusable rows visible as issues instead of throwing", () => {
    const parsed = parseAccountsCsv([
      "account_name,industry,arr,last_contact_date,account_tier,website,region,owner",
      "12345,,banana,not-a-date,TBD,hello@example.com,North America,",
    ].join("\n"));
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].issues.map((item) => item.category)).toEqual(expect.arrayContaining(["identity", "arr", "contact_date", "tier", "website", "owner"]));
    expect(parsed.records[0].issues.some((item) => item.excludesFromRanking)).toBe(true);
  });

  it("does not score unknown events or invalid counts", () => {
    const parsed = parseEngagementJson(JSON.stringify([
      { account_name: "Acme", event_type: "unknown", event_date: "2026-08-01", event_count: 2 },
      { account_name: "Acme", event_type: "email_open", event_date: "2026-08-01", event_count: 0 },
    ]));
    expect(parsed.records).toHaveLength(0);
    expect(parsed.issues).toHaveLength(2);
  });
});
