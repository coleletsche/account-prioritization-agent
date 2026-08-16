import type { DataQualityIssue, EntityResolutionResult } from "./data";
import { stableId } from "./data";

function runtimeIssue(input: Omit<DataQualityIssue, "id">): DataQualityIssue {
  return { ...input, id: stableId("issue", JSON.stringify(input)) };
}

export function getAsOfIssues(data: EntityResolutionResult, asOfDate: string): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const organization of data.organizations) {
    if (organization.lastContactDate && organization.lastContactDate > asOfDate) {
      issues.push(runtimeIssue({
        category: "contact_date",
        severity: "medium",
        source: "resolution",
        entityName: organization.canonicalName,
        organizationId: organization.id,
        relatedRowNumbers: organization.sourceRows,
        fieldNames: ["last_contact_date"],
        message: "Last-contact date is after the prioritization date.",
        evidence: `${organization.lastContactDate} is later than ${asOfDate}`,
        recommendedAction: "Confirm the CRM activity date; timing is held at the neutral score until corrected.",
        excludesFromRanking: false,
      }));
    }

    for (const engagement of organization.engagements) {
      if (engagement.eventDate <= asOfDate) continue;
      issues.push(runtimeIssue({
        category: "engagement",
        severity: "medium",
        source: "engagement",
        rowNumber: engagement.rowNumber,
        entityName: organization.canonicalName,
        organizationId: organization.id,
        relatedRowNumbers: [engagement.rowNumber],
        fieldNames: ["event_date"],
        message: "Engagement signal is after the prioritization date.",
        evidence: `${engagement.eventType} on ${engagement.eventDate} is later than ${asOfDate}`,
        recommendedAction: "Confirm the signal timestamp; future engagement is excluded from intent scoring.",
        excludesFromRanking: false,
      }));
    }
  }

  return issues;
}

export function getEffectiveReviewQueue(data: EntityResolutionResult, asOfDate: string): DataQualityIssue[] {
  return [...data.reviewQueue, ...getAsOfIssues(data, asOfDate)].sort((a, b) => {
    const severity = { high: 0, medium: 1, low: 2 } as const;
    return severity[a.severity] - severity[b.severity]
      || a.category.localeCompare(b.category)
      || (a.entityName ?? "").localeCompare(b.entityName ?? "")
      || (a.rowNumber ?? 0) - (b.rowNumber ?? 0);
  });
}
