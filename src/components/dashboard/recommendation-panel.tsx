"use client";

import { Bot, CheckCircle2, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import type { SalesAgentApiResponse } from "@/lib/agent";

export function RecommendationPanel({ result, totalAccounts, bulkLoading = false, canGenerateAll = true, onGenerateAll }: { result: SalesAgentApiResponse; totalAccounts: number; bulkLoading?: boolean; canGenerateAll?: boolean; onGenerateAll: () => void }) {
  const generated = result.generated_account_ids.length;
  const remaining = Math.max(0, totalAccounts - generated);
  const complete = totalAccounts > 0 && remaining === 0;

  return (
    <section className="agent-panel" aria-labelledby="agent-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-white/60!">Sales agent</p>
          <h2 id="agent-heading" className="mt-2 text-2xl font-extrabold tracking-[-0.025em] text-white">AI outreach plans</h2>
        </div>
        <span className="agent-icon"><Bot size={19} /></span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/65">Plans are generated only when requested. The fixed ranking, scores, bands, and contact policy never change.</p>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-[14px] border border-white/10 bg-white/5 px-3 py-2.5">
        <span className="flex items-center gap-2 text-xs font-bold text-white/65"><ShieldCheck size={14} /> {totalAccounts} validated accounts</span>
        <span className={`agent-source ${generated > 0 ? "agent-source-ai" : ""}`}>{complete ? "Plans complete" : generated > 0 ? "Partially generated" : "Not generated"}</span>
      </div>

      <dl className="agent-coverage mt-4"><div><dt>AI plans</dt><dd>{generated}</dd></div><div><dt>Not generated</dt><dd>{remaining}</dd></div></dl>

      {canGenerateAll ? <button type="button" className="button-agent mt-5 w-full" onClick={onGenerateAll} disabled={bulkLoading || complete || totalAccounts === 0}>{bulkLoading ? <><LoaderCircle className="animate-spin" size={16} /> Generating remaining plans…</> : complete ? <><CheckCircle2 size={16} /> All plans generated</> : <><Sparkles size={16} /> {generated > 0 ? "Generate remaining plans" : "Generate all plans"}</>}</button>
        : <div className="mt-5 flex items-center gap-2 rounded-[12px] border border-white/10 bg-white/5 p-3 text-xs font-bold text-white/65"><CheckCircle2 size={15} /> Generate individual plans from your ranking</div>}

      {result.warning && <p className="mt-3 text-xs leading-5 text-[#ffd4df]" role="status">{result.warning}</p>}
      <p className="mt-4 text-[0.6875rem] leading-5 text-white/40">Only validated account summaries are sent. Raw CRM files are not uploaded or persisted.</p>
    </section>
  );
}
