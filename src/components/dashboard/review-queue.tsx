"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, RotateCcw, Save, Search, Trash2, UserRoundCheck, X } from "lucide-react";
import { ACCOUNT_TIERS, EVENT_TYPES, type DataQualityIssue, type IssueCategory, type RankedAccount } from "@/lib/data";
import {
  buildReconciliationGroups,
  getAccountSource,
  getEngagementSource,
  type AccountSourceRow,
  type DatasetSession,
  type EngagementSourceRow,
  type ReconciliationAction,
  type ReconciliationGroup,
} from "@/lib/reconciliation";
import { useEscape } from "./use-escape";

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  schema: "Import schema", identity: "Organization identity", owner: "Ownership", website: "Website", arr: "ARR", contact_date: "Contact timing", industry: "Industry", tier: "Account tier", engagement: "Engagement", suppression: "Contact suppression",
};

const ACCOUNT_FIELDS = [
  ["account_id", "CRM account ID"], ["account_name", "Account name"], ["aliases", "Confirmed aliases"], ["industry", "Industry"], ["arr", "ARR"],
  ["last_contact_date", "Last contact"], ["account_tier", "Account tier"], ["website", "Website"], ["region", "Region"], ["owner", "Owner"], ["do_not_contact", "Contact suppression"],
] as const;

const ENGAGEMENT_FIELDS = [
  ["account_id", "CRM account ID"], ["account_name", "Account name"], ["domain", "Domain"], ["event_type", "Event type"], ["event_date", "Event date"], ["event_count", "Event count"],
] as const;

type Feedback = { tone: "success" | "error"; message: string };

function issueRows(group: ReconciliationGroup): string {
  const accountRows = group.accountRowNumbers.length > 0 ? `Account ${group.accountRowNumbers.map((row) => `row ${row}`).join(", ")}` : "";
  const engagementRows = group.engagementRowNumbers.length > 0 ? `Engagement ${group.engagementRowNumbers.map((row) => `row ${row}`).join(", ")}` : "";
  return [accountRows, engagementRows].filter(Boolean).join(" · ") || "Resolution review";
}

function IssueEvidence({ issues }: { issues: DataQualityIssue[] }) {
  return <div className="space-y-2" aria-label="Issues for selected record">{issues.map((issue) => (
    <article className="rounded-[12px] border border-line bg-white p-3" key={issue.id}>
      <div className="flex flex-wrap items-center gap-2"><span className={`quality-count quality-${issue.severity}`}>{issue.severity}</span><strong className="text-xs text-ink">{CATEGORY_LABELS[issue.category]}</strong>{issue.excludesFromRanking ? <span className="status-pill ml-auto">Held out</span> : null}</div>
      <p className="mt-2 text-xs font-extrabold leading-5 text-ink">{issue.message}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{issue.evidence}</p>
    </article>
  ))}</div>;
}

function AccountField({ name, label, value, suggestions, onChange }: { name: string; label: string; value: string; suggestions?: string[]; onChange: (value: string) => void }) {
  if (name === "account_tier") return <label className="reconciliation-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Unknown</option>{ACCOUNT_TIERS.map((tier) => <option value={tier} key={tier}>{tier}</option>)}</select></label>;
  if (name === "do_not_contact") return <label className="reconciliation-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Unknown</option><option value="false">Clear</option><option value="true">Suppressed</option></select></label>;
  const inputType = name === "arr" ? "number" : name === "last_contact_date" ? "date" : name === "website" ? "url" : "text";
  const listId = suggestions && suggestions.length > 0 ? `suggestions-${name}` : undefined;
  return <label className="reconciliation-field"><span>{label}</span><input name={name} type={inputType} value={value} min={name === "arr" ? "0" : undefined} step={name === "arr" ? "any" : undefined} list={listId} onChange={(event) => onChange(event.target.value)} />{listId ? <datalist id={listId}>{suggestions?.map((item) => <option value={item} key={item} />)}</datalist> : null}</label>;
}

function AccountEditor({ group, session, revision, onApply }: { group: ReconciliationGroup; session: DatasetSession; revision: number; onApply: (action: ReconciliationAction) => void }) {
  const source = getAccountSource(session);
  const [rowNumber, setRowNumber] = useState(group.accountRowNumbers[0]);
  const row = source.rows[rowNumber - 2] ?? {};
  const conflictFields = [...new Set(group.issues.flatMap((issue) => issue.fieldNames ?? []))];
  const resolvingConflict = group.accountRowNumbers.length > 1 && conflictFields.length > 0;
  const key = `${rowNumber}-${revision}`;
  return <div>
    {group.accountRowNumbers.length > 1 ? <label className="reconciliation-row-picker"><span>Source row</span><select value={rowNumber} onChange={(event) => setRowNumber(Number(event.target.value))}>{group.accountRowNumbers.map((value) => <option value={value} key={value}>Account row {value}</option>)}</select></label> : null}
    {resolvingConflict ? <p className="reconciliation-callout">Choose the canonical values below. Conflict fields will be applied consistently to account rows {group.accountRowNumbers.join(", ")}.</p> : null}
    <AccountForm key={key} row={row} rowNumber={rowNumber} allRows={source.rows} group={group} resolvingConflict={resolvingConflict} conflictFields={conflictFields} onApply={onApply} />
  </div>;
}

function AccountForm({ row, rowNumber, allRows, group, resolvingConflict, conflictFields, onApply }: { row: AccountSourceRow; rowNumber: number; allRows: AccountSourceRow[]; group: ReconciliationGroup; resolvingConflict: boolean; conflictFields: string[]; onApply: (action: ReconciliationAction) => void }) {
  const initial = Object.fromEntries(ACCOUNT_FIELDS.map(([name]) => [name, String(row[name] ?? "")]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const changes = Object.fromEntries(Object.entries(values).filter(([name, value]) => value !== initial[name]));
  const conflictChanges = Object.fromEntries(conflictFields.map((name) => [name, values[name] ?? String(row[name] ?? "")]));
  const extras = Object.entries(row).filter(([name]) => !ACCOUNT_FIELDS.some(([field]) => field === name));
  const submit = () => onApply(resolvingConflict
    ? { kind: "resolve_account_conflict", organizationId: group.organizationId as string, rowNumbers: group.accountRowNumbers, changes: conflictChanges }
    : { kind: "edit_account", rowNumber, changes });
  return <form className="mt-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <div className="reconciliation-form-grid">{ACCOUNT_FIELDS.map(([name, label]) => <AccountField key={name} name={name} label={label} value={values[name]} suggestions={resolvingConflict ? [...new Set(group.accountRowNumbers.map((sourceRow) => String(allRows[sourceRow - 2]?.[name] ?? "")))].filter(Boolean) : undefined} onChange={(value) => setValues((current) => ({ ...current, [name]: value }))} />)}</div>
    {extras.length > 0 ? <details className="reconciliation-extras"><summary>Additional preserved source fields</summary><dl>{extras.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value ?? "") || "Blank"}</dd></div>)}</dl></details> : null}
    <button className="button-primary mt-5 w-full" type="submit" disabled={!resolvingConflict && Object.keys(changes).length === 0}><Save size={16} /> Save &amp; rescore</button>
  </form>;
}

function EngagementEditor({ group, session, revision, onApply }: { group: ReconciliationGroup; session: DatasetSession; revision: number; onApply: (action: ReconciliationAction) => void }) {
  const rows = getEngagementSource(session);
  const rowNumber = group.engagementRowNumbers[0];
  const row = rows[rowNumber - 1] ?? {};
  return <EngagementForm key={`${rowNumber}-${revision}`} row={row} rowNumber={rowNumber} group={group} organizations={session.data.organizations.map((organization) => ({ id: organization.id, name: organization.canonicalName }))} onApply={onApply} />;
}

function EngagementForm({ row, rowNumber, group, organizations, onApply }: { row: EngagementSourceRow; rowNumber: number; group: ReconciliationGroup; organizations: Array<{ id: string; name: string }>; onApply: (action: ReconciliationAction) => void }) {
  const initial = Object.fromEntries(ENGAGEMENT_FIELDS.map(([name]) => [name, String(row[name] ?? "")]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [organizationId, setOrganizationId] = useState("");
  const changes = Object.fromEntries(Object.entries(values).filter(([name, value]) => value !== initial[name]).map(([name, value]) => [name, name === "event_count" ? Number(value) : value]));
  const duplicate = group.issues.some((issue) => issue.message.toLowerCase().includes("duplicate engagement"));
  const identityReview = group.issues.some((issue) => issue.category === "identity" && /could not be matched|more than one organization/i.test(issue.message));
  const extras = Object.entries(row).filter(([name]) => !ENGAGEMENT_FIELDS.some(([field]) => field === name));
  return <>
    <form className="mt-4" onSubmit={(event) => { event.preventDefault(); onApply({ kind: "edit_engagement", rowNumber, changes }); }}>
      <div className="reconciliation-form-grid">{ENGAGEMENT_FIELDS.map(([name, label]) => <label className="reconciliation-field" key={name}><span>{label}</span>{name === "event_type" ? <select value={values[name]} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}><option value="">Select an event</option>{EVENT_TYPES.map((eventType) => <option value={eventType} key={eventType}>{eventType.replaceAll("_", " ")}</option>)}</select> : <input value={values[name]} type={name === "event_date" ? "date" : name === "event_count" ? "number" : "text"} min={name === "event_count" ? "1" : undefined} step={name === "event_count" ? "1" : undefined} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />}</label>)}</div>
      {extras.length > 0 ? <details className="reconciliation-extras"><summary>Additional preserved source fields</summary><dl>{extras.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value ?? "") || "Blank"}</dd></div>)}</dl></details> : null}
      <button className="button-primary mt-5 w-full" type="submit" disabled={Object.keys(changes).length === 0}><Save size={16} /> Save &amp; rescore</button>
    </form>
    {identityReview ? <section className="reconciliation-identity"><div><UserRoundCheck size={17} /><div><strong>Confirm this account alias</strong><p>Selecting an organization adds the engagement name as a confirmed CRM alias. Nothing is matched automatically.</p></div></div><select aria-label="Canonical organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">Select an organization</option>{organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}</select><button className="button-secondary w-full" type="button" disabled={!organizationId} onClick={() => onApply({ kind: "confirm_alias", engagementRowNumber: rowNumber, organizationId })}>Confirm alias &amp; rescore</button></section> : null}
    {duplicate ? <button className="reconciliation-remove mt-4" type="button" onClick={() => { if (window.confirm(`Remove engagement row ${rowNumber} from the working export?`)) onApply({ kind: "remove_engagement", rowNumber }); }}><Trash2 size={15} /> Remove duplicate from working export</button> : null}
  </>;
}

export function ReviewQueue({ open, session, issues, ranked, onApply, onReset, onDownload, onClose }: { open: boolean; session: DatasetSession; issues: DataQualityIssue[]; ranked: RankedAccount[]; onApply: (action: ReconciliationAction) => string; onReset: () => string; onDownload: (source: "accounts" | "engagement") => void; onClose: () => void }) {
  const [category, setCategory] = useState<"all" | IssueCategory>("all");
  const [severity, setSeverity] = useState<"all" | DataQualityIssue["severity"]>("all");
  const [source, setSource] = useState<"all" | ReconciliationGroup["source"]>("all");
  const [heldOutOnly, setHeldOutOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>();
  const groups = useMemo(() => buildReconciliationGroups(session.data, issues), [session.data, issues]);
  const categories = useMemo(() => [...new Set(issues.map((issue) => issue.category))].sort(), [issues]);
  const rankById = useMemo(() => new Map(ranked.map((account) => [account.organization.id, account])), [ranked]);
  const visible = groups.filter((group) => {
    if (category !== "all" && !group.issues.some((issue) => issue.category === category)) return false;
    if (severity !== "all" && group.severity !== severity) return false;
    if (source !== "all" && group.source !== source) return false;
    if (heldOutOnly && !group.heldOut) return false;
    const normalized = query.trim().toLowerCase();
    return !normalized || group.title.toLowerCase().includes(normalized) || group.issues.some((issue) => `${issue.message} ${issue.evidence}`.toLowerCase().includes(normalized));
  });
  const selected = visible.find((group) => group.id === selectedId) ?? visible[0];
  const revision = session.corrections.length;
  useEscape(open, onClose);
  if (!open) return null;

  const apply = (action: ReconciliationAction) => {
    try {
      const message = onApply(action);
      setFeedback({ tone: "success", message });
    } catch (cause) {
      setFeedback({ tone: "error", message: cause instanceof Error ? cause.message : "That correction could not be applied." });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <button type="button" className="absolute inset-0 bg-ink/55" onClick={onClose} aria-label="Dismiss data reconciliation" />
      <section className="reconciliation-panel" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <header className="reconciliation-header">
          <div><p className="eyebrow">Data quality</p><h2 id="review-title">Data reconciliation</h2><p>Correct the source record, then rerun validation, identity resolution, and scoring. Warnings cannot be dismissed.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close data reconciliation"><X size={18} /></button>
        </header>
        <div className="reconciliation-summary">
          <div><strong>{issues.length}</strong><span>active warnings</span></div><div><strong>{groups.length}</strong><span>records to reconcile</span></div><div><strong>{session.corrections.length}</strong><span>session changes</span></div>
          <div className="reconciliation-actions"><button type="button" className="button-compact" disabled={session.corrections.length === 0} onClick={() => { if (!window.confirm("Reset every session correction to the uploaded source values?")) return; try { setFeedback({ tone: "success", message: onReset() }); } catch (cause) { setFeedback({ tone: "error", message: cause instanceof Error ? cause.message : "Corrections could not be reset." }); } }}><RotateCcw size={14} /> Reset to uploaded values</button><button type="button" className="button-compact" onClick={() => onDownload("accounts")}><Download size={14} /> Accounts CSV</button><button type="button" className="button-compact" onClick={() => onDownload("engagement")}><Download size={14} /> Engagement JSON</button></div>
        </div>
        {feedback ? <div className={`reconciliation-feedback reconciliation-feedback-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.tone === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{feedback.message}</span></div> : null}
        {session.corrections.length > 0 ? <details className="reconciliation-change-log"><summary>{session.corrections.length} applied session {session.corrections.length === 1 ? "change" : "changes"}</summary><ul>{session.corrections.map((correction) => <li key={correction.id}><strong>{correction.summary}</strong><span>{correction.source} · {correction.rowNumbers.map((row) => `row ${row}`).join(", ")}</span></li>)}</ul></details> : null}
        <div className="reconciliation-filters">
          <label className="search-field"><Search size={15} /><input aria-label="Search data warnings" value={query} placeholder="Search records or evidence" onChange={(event) => setQuery(event.target.value)} /></label>
          <select aria-label="Filter by category" className="filter-select" value={category} onChange={(event) => setCategory(event.target.value as "all" | IssueCategory)}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}</select>
          <select aria-label="Filter by severity" className="filter-select" value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="all">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <select aria-label="Filter by source" className="filter-select" value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="all">All sources</option><option value="accounts">Accounts</option><option value="engagement">Engagement</option><option value="resolution">Resolution</option></select>
          <label className="reconciliation-check"><input type="checkbox" checked={heldOutOnly} onChange={(event) => setHeldOutOnly(event.target.checked)} /> Held out only</label>
        </div>
        <div className="reconciliation-body">
          <nav className="reconciliation-list" aria-label="Records requiring reconciliation">
            {visible.length === 0 ? <div className="empty-state"><CheckCircle2 size={24} /><h3>No matching issues</h3></div> : visible.map((group) => {
              const account = group.organizationId ? rankById.get(group.organizationId) : undefined;
              return <button type="button" key={group.id} className={`reconciliation-item ${selected?.id === group.id ? "reconciliation-item-active" : ""}`} onClick={() => { setSelectedId(group.id); setFeedback(undefined); }}><div><span className={`quality-count quality-${group.severity}`}>{group.severity}</span>{group.heldOut ? <span className="status-pill">Held out</span> : account ? <span className="reconciliation-rank">Rank #{account.rank}</span> : null}</div><strong>{group.title}</strong><span>{group.issues.length} {group.issues.length === 1 ? "warning" : "warnings"} · {issueRows(group)}</span></button>;
            })}
          </nav>
          <div className="reconciliation-detail">
            {!selected ? <div className="empty-state"><CheckCircle2 size={24} /><h3>No records need reconciliation</h3><p>The current working exports pass all dashboard checks.</p></div> : <>
              <div className="reconciliation-detail-heading"><div><p className="eyebrow">Source-backed correction</p><h3>{selected.title}</h3><p>{issueRows(selected)} · correcting this record may move other accounts because cohort percentiles are recalculated.</p></div></div>
              <IssueEvidence issues={selected.issues} />
              {selected.accountRowNumbers.length > 0 ? <AccountEditor key={selected.id} group={selected} session={session} revision={revision} onApply={apply} /> : selected.engagementRowNumbers.length > 0 ? <EngagementEditor key={selected.id} group={selected} session={session} revision={revision} onApply={apply} /> : <p className="reconciliation-callout">This resolution issue needs a corrected source identifier before it can be rescored.</p>}
            </>}
          </div>
        </div>
      </section>
    </div>
  );
}
