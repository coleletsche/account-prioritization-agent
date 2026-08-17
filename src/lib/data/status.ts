import type { DataQualityIssue, ValidationStatus } from "./types";

export function validationStatusFromIssues(issues: DataQualityIssue[]): ValidationStatus {
  if (issues.some((issue) => issue.excludesFromRanking)) return "blocked";
  return issues.length > 0 ? "warning" : "valid";
}
