import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { getEffectiveReviewQueue } from "./quality";
import {
  applyReconciliationAction,
  buildReconciliationGroups,
  createDatasetSession,
  getAccountSource,
  resetDatasetSession,
} from "./reconciliation";
import { rankOrganizations } from "./scoring";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "public/sample-data", name), "utf8");
const sampleSession = () => createDatasetSession({ accountsCsv: fixture("accounts.csv"), engagementsJson: fixture("engagement_signals.json") });

function accountCsv(rows: string[]): string {
  return ["account_name,industry,arr,last_contact_date,account_tier,website,region,owner,aliases,custom_field", ...rows].join("\n");
}

describe("data reconciliation", () => {
  it("groups row warnings and makes the held-out sample identity eligible after correction", () => {
    const session = sampleSession();
    const issues = getEffectiveReviewQueue(session.data, "2026-08-17");
    const groups = buildReconciliationGroups(session.data, issues);
    expect(groups.length).toBeLessThan(issues.length);
    expect(session.data.statistics.excludedOrganizations).toBe(1);

    const next = applyReconciliationAction(session, { kind: "edit_account", rowNumber: 24, changes: { account_name: "TechSoup" } });
    expect(next.data.statistics.excludedOrganizations).toBe(0);
    expect(rankOrganizations(next.data.organizations, { asOfDate: "2026-08-17" })).toHaveLength(286);
    expect(next.data.reviewQueue).not.toContainEqual(expect.objectContaining({ rowNumber: 24, category: "identity" }));
  });

  it("reruns cohort scoring for ARR while industry-only corrections leave scores unchanged", () => {
    const session = sampleSession();
    const organization = session.data.organizations.find((candidate) => candidate.sourceRows.includes(2));
    expect(organization).toBeDefined();
    const before = rankOrganizations(session.data.organizations, { asOfDate: "2026-08-17" });
    const withIndustry = applyReconciliationAction(session, { kind: "edit_account", rowNumber: 2, changes: { industry: "International Aid" } });
    const afterIndustry = rankOrganizations(withIndustry.data.organizations, { asOfDate: "2026-08-17" });
    expect(afterIndustry.find((account) => account.organization.id === organization?.id)?.priorityScore)
      .toBe(before.find((account) => account.organization.id === organization?.id)?.priorityScore);

    const withArr = applyReconciliationAction(withIndustry, { kind: "edit_account", rowNumber: 2, changes: { arr: "250000" } });
    const afterArr = rankOrganizations(withArr.data.organizations, { asOfDate: "2026-08-17" });
    expect(afterArr.find((account) => account.organization.id === organization?.id)?.priorityScore)
      .not.toBe(afterIndustry.find((account) => account.organization.id === organization?.id)?.priorityScore);
  });

  it("supports every editable account field and resolves duplicate-record conflicts", () => {
    const session = createDatasetSession({
      accountsCsv: accountCsv([
        "Acme,Technology,1000,2026-08-01,Enterprise,https://acme.example,North America,Rep A,,first",
        "Acme Foundation,Healthcare,2000,2026-07-01,Strategic,https://acme.example,Europe,Rep B,,second",
      ]),
      engagementsJson: "[]",
    });
    const organization = session.data.organizations[0];
    expect(organization.eligible).toBe(false);
    const reconciled = applyReconciliationAction(session, {
      kind: "resolve_account_conflict", organizationId: organization.id, rowNumbers: [2, 3],
      changes: { owner: "Rep A", account_tier: "Enterprise", region: "North America", industry: "Technology" },
    });
    expect(reconciled.data.organizations[0]).toMatchObject({ eligible: true, owner: "Rep A", accountTier: "Enterprise", region: "North America", industry: "Technology" });
    const edited = applyReconciliationAction(reconciled, {
      kind: "edit_account", rowNumber: 2,
      changes: { account_id: "crm-1", account_name: "Acme Global", aliases: "Acme | Acme Co", industry: "Software", arr: "5000", last_contact_date: "2026-08-02", account_tier: "Strategic", website: "https://global.acme.example", region: "Europe", owner: "Rep C", do_not_contact: "false" },
    });
    const row = getAccountSource(edited).rows[0];
    expect(row).toMatchObject({ account_id: "crm-1", account_name: "Acme Global", aliases: "Acme | Acme Co", industry: "Software", arr: "5000", last_contact_date: "2026-08-02", account_tier: "Strategic", website: "https://global.acme.example", region: "Europe", owner: "Rep C", do_not_contact: "false", custom_field: "first" });
  });

  it("removes future-date warnings only after the source date is corrected", () => {
    const session = sampleSession();
    const organization = session.data.organizations.find((candidate) => candidate.canonicalName === "Citizen Schools");
    expect(organization).toBeDefined();
    expect(getEffectiveReviewQueue(session.data, "2026-08-17")).toContainEqual(expect.objectContaining({ organizationId: organization?.id, category: "contact_date" }));
    const next = applyReconciliationAction(session, { kind: "edit_account", rowNumber: organization?.sourceRows[0] as number, changes: { last_contact_date: "2026-08-01" } });
    expect(getEffectiveReviewQueue(next.data, "2026-08-17")).not.toContainEqual(expect.objectContaining({ organizationId: organization?.id, category: "contact_date" }));
  });

  it("repairs unusable engagements and confirms explicit aliases without fuzzy guessing", () => {
    const session = createDatasetSession({
      accountsCsv: accountCsv(["Acme Foundation,Technology,1000,2026-08-01,Enterprise,https://acme.example,North America,Rep A,,keep-me"]),
      engagementsJson: JSON.stringify([{ account_name: "Acme Outreach", event_type: "unknown", event_date: "2026-08-10", event_count: 1 }]),
    });
    expect(session.data.statistics.matchedSignals).toBe(0);
    const validEvent = applyReconciliationAction(session, { kind: "edit_engagement", rowNumber: 1, changes: { event_type: "demo_request" } });
    expect(validEvent.data.statistics.unmatchedSignals).toBe(1);
    const organization = validEvent.data.organizations[0];
    const matched = applyReconciliationAction(validEvent, { kind: "confirm_alias", engagementRowNumber: 1, organizationId: organization.id });
    expect(matched.data.statistics.matchedSignals).toBe(1);
    expect(matched.data.organizations[0].aliases).toContain("Acme Outreach");
  });

  it("edits engagement identity, domain, event type, date, and count as one validated source row", () => {
    const session = createDatasetSession({
      accountsCsv: accountCsv(["Acme,Technology,1000,2026-08-01,Enterprise,https://acme.example,North America,Rep A,,keep-me"]),
      engagementsJson: JSON.stringify([{ account_name: "Wrong Name", domain: "wrong.example", event_type: "email_open", event_date: "2026-08-01", event_count: 1, custom: "preserved" }]),
    });
    const next = applyReconciliationAction(session, { kind: "edit_engagement", rowNumber: 1, changes: { account_name: "Acme", domain: "acme.example", event_type: "demo_request", event_date: "2026-08-10", event_count: 3 } });
    expect(next.data.statistics.matchedSignals).toBe(1);
    expect(next.data.organizations[0].engagements[0]).toMatchObject({ accountName: "Acme", eventType: "demo_request", eventDate: "2026-08-10", eventCount: 3 });
    expect(JSON.parse(next.workingSources.engagementsJson)[0].custom).toBe("preserved");
  });

  it("rejects an explicitly confirmed alias when it remains ambiguous", () => {
    const session = createDatasetSession({
      accountsCsv: accountCsv([
        "Acme Inc,Technology,1000,2026-08-01,Enterprise,https://one.example,North America,Rep A,Acme Incorporated,one",
        "Acme,Technology,1000,2026-08-01,Enterprise,https://two.example,North America,Rep B,Acme Incorporated,two",
      ]),
      engagementsJson: JSON.stringify([{ account_name: "Acme Incorporated", event_type: "demo_request", event_date: "2026-08-10", event_count: 1 }]),
    });
    expect(() => applyReconciliationAction(session, { kind: "confirm_alias", engagementRowNumber: 1, organizationId: session.data.organizations[0].id })).toThrow(/still ambiguous/i);
    expect(session.corrections).toHaveLength(0);
  });

  it("removes only the selected duplicate and produces corrected exports without dropping unknown columns", () => {
    const duplicate = { account_name: "Acme", event_type: "demo_request", event_date: "2026-08-10", event_count: 1 };
    const session = createDatasetSession({
      accountsCsv: accountCsv(["Acme,Technology,1000,2026-08-01,Enterprise,https://acme.example,North America,Rep A,,keep-me"]),
      engagementsJson: JSON.stringify([duplicate, duplicate]),
    });
    const next = applyReconciliationAction(session, { kind: "remove_engagement", rowNumber: 2 });
    expect(next.data.statistics.sourceSignalRows).toBe(1);
    expect(JSON.parse(next.workingSources.engagementsJson)).toHaveLength(1);
    const parsed = Papa.parse<Record<string, string>>(next.workingSources.accountsCsv, { header: true });
    expect(parsed.data[0].custom_field).toBe("keep-me");
  });

  it("rolls invalid changes back atomically and can reset every session correction", () => {
    const session = sampleSession();
    expect(() => applyReconciliationAction(session, { kind: "edit_engagement", rowNumber: 1, changes: { event_count: 0 } })).toThrow(/positive whole number/i);
    expect(() => applyReconciliationAction(session, { kind: "edit_account", rowNumber: 2, changes: { arr: "-1" } })).toThrow(/nonnegative/i);
    expect(session.corrections).toHaveLength(0);
    const changed = applyReconciliationAction(session, { kind: "edit_account", rowNumber: 2, changes: { arr: "500" } });
    expect(changed.corrections).toHaveLength(1);
    const reset = resetDatasetSession(changed);
    expect(reset.corrections).toHaveLength(0);
    expect(getAccountSource(reset).rows[0].arr).toBe("");
  });
});
