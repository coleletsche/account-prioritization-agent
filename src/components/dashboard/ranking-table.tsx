"use client";

import { ArrowUpRight, CircleAlert, MousePointerClick } from "lucide-react";
import type { RankedAccount } from "@/lib/data";

function eventSummary(account: RankedAccount) {
  const latest = account.organization.engagements[0];
  if (!latest) return "No matched signals";
  return `${latest.eventType.replaceAll("_", " ")} · ${latest.eventDate}`;
}

export function RankingTable({ accounts, showGlobalRank, onSelect }: { accounts: RankedAccount[]; showGlobalRank: boolean; onSelect: (account: RankedAccount) => void }) {
  if (accounts.length === 0) return (
    <div className="empty-state"><CircleAlert size={24} /><h3>No accounts match these filters</h3><p>Clear one or more filters to restore the ranked list.</p></div>
  );

  return (
    <div className="table-frame">
      <table className="ranking-table" data-testid="ranking-table">
        <thead><tr><th>Rank</th><th>Account</th><th>Latest intent</th><th>Why this week</th><th>Owner</th><th className="text-right!">Priority</th></tr></thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.organization.id}>
              <td><span className="rank-number">{showGlobalRank ? account.rank : account.ownerRank}</span></td>
              <td>
                <button type="button" className="account-link" onClick={() => onSelect(account)}>
                  <span className="truncate font-extrabold text-ink">{account.organization.canonicalName}</span>
                  <ArrowUpRight size={14} className="shrink-0 text-brand" aria-hidden="true" />
                </button>
                <div className="mt-1 flex items-center gap-2"><span className={`confidence-dot confidence-${account.organization.confidence}`} /><span className="text-xs capitalize text-muted">{account.organization.confidence} confidence</span></div>
              </td>
              <td><p className="max-w-[190px] text-sm capitalize text-ink">{eventSummary(account)}</p><p className="mt-1 text-xs text-muted">Intent {account.factors.intent.toFixed(0)}</p></td>
              <td><p className="max-w-[280px] text-sm leading-6 text-muted">{account.reason}</p></td>
              <td><span className="owner-chip">{account.organization.owner}</span></td>
              <td className="text-right"><button type="button" className="score-button" onClick={() => onSelect(account)} aria-label={`Open ${account.organization.canonicalName}, score ${account.score.toFixed(1)}`}><strong>{account.score.toFixed(1)}</strong><MousePointerClick size={13} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
