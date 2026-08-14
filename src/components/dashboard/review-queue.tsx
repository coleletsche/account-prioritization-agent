"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Filter, X } from "lucide-react";
import type { DataQualityIssue, IssueCategory } from "@/lib/data";
import { useEscape } from "./use-escape";

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  schema: "Import schema", identity: "Organization identity", owner: "Ownership", website: "Website", arr: "ARR", contact_date: "Contact timing", industry: "Industry", tier: "Account tier", engagement: "Engagement",
};

export function ReviewQueue({ open, issues, onClose }: { open: boolean; issues: DataQualityIssue[]; onClose: () => void }) {
  const [category, setCategory] = useState<"all" | IssueCategory>("all");
  const categories = useMemo(() => [...new Set(issues.map((issue) => issue.category))].sort(), [issues]);
  const visible = category === "all" ? issues : issues.filter((issue) => issue.category === category);
  useEscape(open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-ink/55" onClick={onClose} aria-label="Dismiss review queue" />
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="flex items-start justify-between gap-4 border-b border-line p-6 sm:p-8">
          <div><p className="eyebrow">Data quality</p><h2 id="review-title" className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink">Review queue</h2><p className="mt-3 text-sm leading-6 text-muted">Every unusable or lower-confidence input remains visible with evidence and a suggested CRM correction.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close review queue"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-4 border-b border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex flex-wrap gap-2"><span className="quality-count quality-high">{issues.filter((issue) => issue.severity === "high").length} high</span><span className="quality-count quality-medium">{issues.filter((issue) => issue.severity === "medium").length} medium</span><span className="quality-count quality-low">{issues.filter((issue) => issue.severity === "low").length} low</span></div>
          <label className="flex items-center gap-2 text-xs font-bold text-muted"><Filter size={14} /><select aria-label="Filter review queue by category" className="filter-select" value={category} onChange={(event) => setCategory(event.target.value as "all" | IssueCategory)}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}</select></label>
        </div>
        <div className="max-h-[58vh] overflow-y-auto p-6 sm:p-8">
          {visible.length === 0 ? <div className="empty-state"><CheckCircle2 size={24} /><h3>No issues in this category</h3></div> : (
            <ul className="space-y-3">{visible.map((issue) => (
              <li className="review-item" key={issue.id}>
                <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-brand" /><div><div className="flex flex-wrap items-center gap-2"><span className={`quality-count quality-${issue.severity}`}>{issue.severity}</span><span className="text-xs font-bold text-muted">{CATEGORY_LABELS[issue.category]} · {issue.source}{issue.rowNumber ? ` row ${issue.rowNumber}` : ""}</span></div><h3 className="mt-2 text-sm font-extrabold text-ink">{issue.entityName ? `${issue.entityName}: ` : ""}{issue.message}</h3></div></div>{issue.excludesFromRanking && <span className="status-pill shrink-0">Held out</span>}</div>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="font-extrabold uppercase tracking-[0.08em] text-muted">Evidence</dt><dd className="mt-1 leading-5 text-ink">{issue.evidence}</dd></div><div><dt className="font-extrabold uppercase tracking-[0.08em] text-muted">Suggested CRM correction</dt><dd className="mt-1 leading-5 text-ink">{issue.recommendedAction}</dd></div></dl>
              </li>
            ))}</ul>
          )}
        </div>
      </section>
    </div>
  );
}
