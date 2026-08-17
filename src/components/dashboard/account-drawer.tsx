"use client";

import { AlertTriangle, Calendar, ExternalLink, LoaderCircle, Signal, Sparkles, X } from "lucide-react";
import type { AccountRecommendation } from "@/lib/agent";
import type { DataQualityIssue, RankedAccount } from "@/lib/data";
import { daysBetween } from "@/lib/scoring";
import { useEscape } from "./use-escape";

const FACTOR_LABELS = { intent: "Intent", value: "Account value", timing: "Contact timing" } as const;
const EVENT_LABELS: Record<string, string> = {
  email_open: "Email open", page_visit: "Page visit", content_download: "Content download", webinar: "Webinar", demo_request: "Demo request",
};

function formatCurrency(value?: number) {
  return value === undefined ? "Not available" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function AccountDrawer({ account, recommendation, generating = false, generationError, issues = [], onGenerate, onClose }: { account?: RankedAccount; recommendation?: AccountRecommendation; generating?: boolean; generationError?: string; issues?: DataQualityIssue[]; onGenerate: (account: RankedAccount) => void; onClose: () => void }) {
  useEscape(Boolean(account), onClose);
  if (!account) return null;
  const { organization } = account;
  const futureContact = organization.lastContactDate ? daysBetween(organization.lastContactDate, account.asOfDate) < 0 : false;
  const warnings = [...new Map([...organization.issues, ...issues].map((issue) => [issue.id, issue])).values()];

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button type="button" className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} aria-label="Dismiss account details" />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-6 py-5 backdrop-blur sm:px-8">
          <div>
            <p className="eyebrow">Priority #{account.ownerRank} for {organization.owner}</p>
            <h2 id="account-title" className="mt-2 text-2xl font-black tracking-[-0.035em] text-ink sm:text-3xl">{organization.canonicalName}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close account details"><X size={19} /></button>
        </div>

        <div className="space-y-8 p-6 sm:p-8">
          <section className="rounded-card bg-ink p-6 text-white">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-white/50">Priority score · {account.priorityBand}</p>
                <p className="mt-2 text-5xl font-black tabular-nums">{account.score.toFixed(1)}</p>
              </div>
              <span className={`confidence-pill confidence-${organization.confidence}`}>{organization.confidence} confidence</span>
            </div>
            <p className="mt-5 border-t border-white/10 pt-5 text-sm leading-6 text-white/70">{account.reason}</p>
          </section>

          {recommendation && <section className="agent-recommendation" aria-labelledby="recommendation-heading">
            <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="metric-icon"><Sparkles size={17} /></span><div><h3 id="recommendation-heading" className="section-title">AI outreach plan</h3><p className="mt-1 text-xs text-muted">AI generated · policy checked</p></div></div><span className={`action-pill action-${recommendation.recommended_action}`}>{recommendation.recommended_action.replaceAll("_", " ")}</span></div>
            <dl className="mt-5 space-y-4 text-sm"><div><dt className="font-extrabold text-ink">Why now</dt><dd className="mt-1.5 leading-6 text-muted">{recommendation.why_now}</dd></div><div><dt className="font-extrabold text-ink">Call plan</dt><dd className="mt-1.5 leading-6 text-muted">{recommendation.call_angle}</dd></div></dl>
            <p className="mt-4 text-xs capitalize text-muted">Urgency: {recommendation.urgency} · Agent confidence: {recommendation.confidence}</p>
          </section>}

          {!recommendation && <section className="agent-recommendation agent-recommendation-empty" aria-labelledby="recommendation-heading">
            <span className="metric-icon"><Sparkles size={17} /></span>
            <div><h3 id="recommendation-heading" className="section-title">Generate an AI outreach plan</h3><p className="mt-1.5 text-sm leading-6 text-muted">Create a grounded Why now, recommended action, and call plan from this account’s validated CRM and engagement evidence.</p>{generationError && <p className="mt-2 text-xs font-bold text-[#9f2348]" role="status">{generationError}</p>}</div>
            <button type="button" className="button-primary" disabled={generating} onClick={() => onGenerate(account)}>{generating ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />} {generating ? "Generating plan…" : generationError ? "Retry AI plan" : "Generate AI plan"}</button>
          </section>}

          <section aria-labelledby="factor-heading">
            <h3 id="factor-heading" className="section-title">Factor breakdown</h3>
            <div className="mt-4 space-y-4">
              {(Object.keys(account.factors) as Array<keyof typeof account.factors>).map((factor) => (
                <div key={factor}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-bold text-ink">{FACTOR_LABELS[factor]} <span className="font-medium text-muted">· {account.weights[factor]}% weight</span></span>
                    <strong className="tabular-nums text-ink">{account.factors[factor]?.toFixed(1) ?? "Unknown"}</strong>
                  </div>
                  <div className="factor-track"><div className={`factor-fill factor-${factor}`} style={{ width: `${account.factors[factor] ?? 0}%` }} /></div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="inputs-heading">
            <h3 id="inputs-heading" className="section-title">Inputs used</h3>
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-line bg-line">
              {[
                ["Account tier", organization.accountTier ?? "Not available"],
                ["ARR proxy", formatCurrency(organization.arr)],
                ["Last contact", organization.lastContactDate ?? "Not available"],
                ["Account score", account.accountScore?.toFixed(1) ?? "Unknown"],
                ["Intent score", account.intentScore.toFixed(1)],
                ["Data status", organization.validationStatus],
                ["Contact suppression", organization.contactSuppressed === undefined ? "Not provided" : organization.contactSuppressed ? "Suppressed" : "Clear"],
                ["Signals", String(organization.engagements.length)],
              ].map(([label, value]) => (
                <div key={label} className="bg-white p-4"><dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{label}</dt><dd className="mt-2 text-sm font-extrabold text-ink">{value}</dd></div>
              ))}
            </dl>
            {futureContact && <p className="warning-note mt-3"><AlertTriangle size={15} /> Future-dated contact is unknown and omitted from scoring.</p>}
          </section>

          <section aria-labelledby="engagement-heading">
            <div className="flex items-center justify-between gap-3">
              <h3 id="engagement-heading" className="section-title">Engagement timeline</h3>
              <Signal size={18} className="text-brand" aria-hidden="true" />
            </div>
            {organization.engagements.length > 0 ? (
              <ol className="mt-4 space-y-3">
                {organization.engagements.map((engagement) => (
                  <li key={`${engagement.rowNumber}-${engagement.eventType}`} className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink">{EVENT_LABELS[engagement.eventType]}</p>
                      <p className="mt-1 text-sm text-muted">{engagement.eventCount} events · {engagement.eventDate}{engagement.validationStatus === "blocked" || engagement.eventDate > account.asOfDate ? " · not scored" : ""}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-4 rounded-[16px] bg-canvas p-4 text-sm text-muted">No matched engagement in this export.</p>}
          </section>

          {organization.aliases.length > 1 && (
            <section aria-labelledby="aliases-heading"><h3 id="aliases-heading" className="section-title">Merged CRM aliases</h3><div className="mt-3 flex flex-wrap gap-2">{organization.aliases.map((alias) => <span className="alias-chip" key={alias}>{alias}</span>)}</div></section>
          )}

          {warnings.length > 0 && (
            <section aria-labelledby="warning-heading">
              <h3 id="warning-heading" className="section-title">Data warnings</h3>
              <ul className="mt-4 space-y-3">{warnings.map((item) => <li className="issue-card" key={item.id}><AlertTriangle size={16} className="mt-0.5 shrink-0 text-brand" /><div><p className="text-sm font-bold text-ink">{item.message}</p><p className="mt-1 text-xs leading-5 text-muted">{item.recommendedAction}</p></div></li>)}</ul>
            </section>
          )}

          {organization.website && <a className="button-secondary w-full" href={organization.website} target="_blank" rel="noreferrer">Visit organization website <ExternalLink size={16} /></a>}
          <p className="flex items-center gap-2 text-xs text-muted"><Calendar size={14} /> Ranked for the week of {account.asOfDate}</p>
        </div>
      </aside>
    </div>
  );
}
