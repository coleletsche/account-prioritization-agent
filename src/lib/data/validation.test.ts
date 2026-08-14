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
      blockedSignals: 0,
    });
    expect(result.statistics.validOrganizations + result.statistics.warningOrganizations + result.statistics.blockedOrganizations).toBe(286);
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
    expect(parsed.records[0].validationStatus).toBe("blocked");
  });

  it("does not score unknown events or invalid counts", () => {
    const parsed = parseEngagementJson(JSON.stringify([
      { account_name: "Acme", event_type: "unknown", event_date: "2026-08-01", event_count: 2 },
      { account_name: "Acme", event_type: "email_open", event_date: "2026-08-01", event_count: 0 },
    ]));
    expect(parsed.records).toHaveLength(0);
    expect(parsed.issues).toHaveLength(2);
  });

  it("routes ambiguous aliases to review instead of fuzzy-attaching a signal", () => {
    const accounts = [
      "account_name,industry,arr,last_contact_date,account_tier,website,region,owner",
      "Acme Inc,Technology,1000,2026-08-01,Enterprise,https://acme-one.example,North America,Rep A",
      "Acme,Technology,2000,2026-08-01,Enterprise,https://acme-two.example,North America,Rep B",
    ].join("\n");
    const result = processCrmExports(accounts, JSON.stringify([
      { account_name: "ACME INCORPORATED", event_type: "demo_request", event_date: "2026-08-10", event_count: 1 },
    ]));

    expect(result.statistics).toMatchObject({ resolvedOrganizations: 2, matchedSignals: 0, unmatchedSignals: 1 });
    expect(result.reviewQueue).toContainEqual(expect.objectContaining({ category: "identity", message: "Engagement account matched more than one organization." }));
  });

  it("prefers stable IDs and domains and stores confirmed engagement aliases", () => {
    const accounts = [
      "account_name,industry,arr,last_contact_date,account_tier,website,region,owner,account_id,aliases",
      "Acme Foundation,Technology,1000,2026-08-01,Enterprise,https://acme.example,North America,Rep A,crm-1,Acme Fdn",
    ].join("\n");
    const result = processCrmExports(accounts, JSON.stringify([
      { account_id: "crm-1", account_name: "Completely Different Export Name", event_type: "demo_request", event_date: "2026-08-10", event_count: 1 },
      { domain: "acme.example", account_name: "Another Confirmed Name", event_type: "webinar", event_date: "2026-08-09", event_count: 1 },
    ]));

    expect(result.statistics).toMatchObject({ matchedSignals: 2, unmatchedSignals: 0 });
    expect(result.organizations[0].engagements.map((signal) => signal.matchedBy)).toEqual(expect.arrayContaining(["account_id", "domain"]));
    expect(result.organizations[0].aliases).toEqual(expect.arrayContaining(["Acme Fdn", "Completely Different Export Name", "Another Confirmed Name"]));
  });

  it("flags exact duplicate events and excludes only the duplicate from scoring", () => {
    const accounts = [
      "account_name,industry,arr,last_contact_date,account_tier,website,region,owner",
      "Acme,Technology,1000,2026-08-01,Enterprise,https://acme.example,North America,Rep A",
    ].join("\n");
    const duplicate = { account_name: "Acme", event_type: "demo_request", event_date: "2026-08-10", event_count: 1 };
    const result = processCrmExports(accounts, JSON.stringify([duplicate, duplicate]));

    expect(result.statistics).toMatchObject({ matchedSignals: 2, blockedSignals: 1 });
    expect(result.organizations[0].engagements.filter((signal) => signal.validationStatus === "blocked")).toHaveLength(1);
    expect(result.reviewQueue).toContainEqual(expect.objectContaining({ message: "Exact duplicate engagement is excluded from intent scoring." }));
  });

  it("validates optional contact-suppression values without guessing", () => {
    const parsed = parseAccountsCsv([
      "account_name,industry,arr,last_contact_date,account_tier,website,region,owner,do_not_contact",
      "Suppressed Co,Technology,1000,2026-08-01,Enterprise,https://suppressed.example,North America,Rep A,yes",
      "Unknown Co,Technology,1000,2026-08-01,Enterprise,https://unknown.example,North America,Rep A,maybe",
    ].join("\n"));

    expect(parsed.records[0]).toMatchObject({ contactSuppressed: true, validationStatus: "valid" });
    expect(parsed.records[1]).toMatchObject({ contactSuppressed: undefined, validationStatus: "blocked" });
    expect(parsed.records[1].issues).toContainEqual(expect.objectContaining({ category: "suppression" }));
  });
});
