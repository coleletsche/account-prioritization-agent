"use client";

import { ArrowUpRight, CircleAlert, MousePointerClick } from "lucide-react";
import type { AccountRecommendation } from "@/lib/agent";
import type { RankedAccount } from "@/lib/data";

const ACTION_LABELS: Record<AccountRecommendation["recommended_action"], string> = {
  call_today: "Call today",
  call_this_week: "Call this week",
  email: "Email",
  nurture: "Nurture",
  research: "Research",
  no_action: "No action",
  needs_data_review: "Needs review",
};

function eventSummary(account: RankedAccount) {
  const latest = account.organization.engagements[0];
  if (!latest) return "No matched signals";
  return `${latest.eventType.replaceAll("_", " ")} · ${latest.eventDate}`;
}

export function RankingTable({ accounts, recommendations, showGlobalRank, onSelect }: { accounts: RankedAccount[]; recommendations?: ReadonlyMap<string, AccountRecommendation>; showGlobalRank: boolean; onSelect: (account: RankedAccount) => void }) {
  if (accounts.length === 0) return (
    <div className="empty-state"><CircleAlert size={24} /><h3>No accounts match these filters</h3><p>Clear one or more filters to restore the ranked list.</p></div>
  );

  return (
    <div className="table-frame">
      <table className="ranking-table" data-testid="ranking-table">
        <thead><tr><th>Rank</th><th>Account</th><th>Recent signals</th><th>Why now</th><th>Recommended action</th><th>Owner</th><th className="text-right!">Priority</th></tr></thead>
        <tbody>
          {accounts.map((account) => {
            const recommendation = recommendations?.get(account.organization.id);
            return <tr key={account.organization.id}>
              <td><span className="rank-number">{showGlobalRank ? account.rank : account.ownerRank}</span></td>
              <td>
                <button type="button" className="account-link" onClick={() => onSelect(account)}>
                  <span className="truncate font-extrabold text-ink">{account.organization.canonicalName}</span>
                  <ArrowUpRight size={14} className="shrink-0 text-brand" aria-hidden="true" />
                </button>
                <div className="mt-1 flex items-center gap-2"><span className={`confidence-dot confidence-${account.organization.confidence}`} /><span className="text-xs capitalize text-muted">{account.organization.validationStatus} data{account.organization.issues.length > 0 ? ` · ${account.organization.issues.length} warning${account.organization.issues.length === 1 ? "" : "s"}` : ""}</span></div>
              </td>
              <td><p className="max-w-[190px] text-sm capitalize text-ink">{eventSummary(account)}</p><p className="mt-1 text-xs text-muted">Intent {account.factors.intent.toFixed(0)}</p></td>
              <td><p className="max-w-[290px] text-sm leading-6 text-muted">{recommendation?.why_now ?? account.reason}</p></td>
              <td>{recommendation ? <div><span className={`action-pill action-${recommendation.recommended_action}`}>{ACTION_LABELS[recommendation.recommended_action]}</span><p className="mt-1.5 text-xs capitalize text-muted">{recommendation.urgency} · {recommendation.confidence}</p></div> : <span className="text-xs text-muted">Outside daily Top 10</span>}</td>
              <td><span className="owner-chip">{account.organization.owner}</span></td>
              <td className="text-right"><button type="button" className="score-button" onClick={() => onSelect(account)} aria-label={`Open ${account.organization.canonicalName}, ${account.priorityBand}, score ${account.priorityScore.toFixed(1)}`}><span className={`priority-band band-${account.priorityBand.toLowerCase()}`}>{account.priorityBand}</span><strong>{account.priorityScore.toFixed(1)}</strong><MousePointerClick size={13} /></button></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
