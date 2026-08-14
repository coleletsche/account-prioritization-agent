"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, LoaderCircle, LockKeyhole, RefreshCw, Sparkles } from "lucide-react";
import { BriefingApiResponseSchema, buildBriefingRequest, deterministicBriefing, type BriefingApiResponse } from "@/lib/briefing";
import type { DataQualityIssue, RankedAccount, ResolutionStatistics, ScoreWeights } from "@/lib/data";

export function BriefingPanel({ accounts, weights, asOfDate, issues, statistics }: { accounts: RankedAccount[]; weights: ScoreWeights; asOfDate: string; issues: DataQualityIssue[]; statistics: ResolutionStatistics }) {
  const [result, setResult] = useState<BriefingApiResponse>();
  const [loading, setLoading] = useState(false);
  const request = useMemo(() => buildBriefingRequest(accounts, { asOfDate, weights, issues, statistics }), [accounts, asOfDate, issues, statistics, weights]);

  const generate = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/briefing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
      const parsed = BriefingApiResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The briefing response was invalid.");
      setResult(parsed.data);
    } catch {
      setResult({ briefing: deterministicBriefing(request), source: "fallback", warning: "The briefing service could not be reached. Showing the deterministic summary." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="briefing-panel" aria-labelledby="briefing-heading">
      <div className="flex items-start justify-between gap-3">
        <div><p className="eyebrow text-white/60!">Optional AI briefing</p><h2 id="briefing-heading" className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-white">Monday in 60 seconds</h2></div>
        <span className="briefing-icon"><Sparkles size={18} /></span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/60">Summarizes the fixed shortlist. It cannot edit ranks or participate in scoring.</p>

      {!result ? (
        <div className="briefing-empty mt-6"><Bot size={20} /><p>Generate a grounded leadership readout from at most 40 ranked summaries.</p></div>
      ) : (
        <div className="mt-6 space-y-5" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2"><span className={`briefing-source ${result.source === "ai" ? "briefing-source-ai" : ""}`}>{result.source === "ai" ? <><CheckCircle2 size={12} /> AI grounded</> : <><RefreshCw size={12} /> Deterministic fallback</>}</span></div>
          <div><h3 className="text-lg font-extrabold leading-snug text-white">{result.briefing.headline}</h3>{result.warning && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#ffd6a1]"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{result.warning}</p>}</div>
          <BriefingList title="Themes" items={result.briefing.themes} />
          <BriefingList title="Actions" items={result.briefing.actions} ordered />
          {result.briefing.caveats.length > 0 && <BriefingList title="Caveats" items={result.briefing.caveats} />}
        </div>
      )}

      <button type="button" className="briefing-button mt-6" onClick={generate} disabled={loading || accounts.length === 0}>
        {loading ? <><LoaderCircle size={16} className="animate-spin" /> Preparing briefing…</> : result ? <><RefreshCw size={16} /> Refresh briefing</> : <><Sparkles size={16} /> Generate briefing</>}
      </button>
      <p className="mt-4 flex items-start gap-2 border-t border-white/10 pt-4 text-[0.6875rem] leading-5 text-white/40"><LockKeyhole size={13} className="mt-0.5 shrink-0" /> Sends shortlist facts and aggregate quality counts only. Raw CRM files are never sent or stored.</p>
    </section>
  );
}

function BriefingList({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  const Component = ordered ? "ol" : "ul";
  return <div><p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.11em] text-white/40">{title}</p><Component className={`mt-2 space-y-2 text-xs leading-5 text-white/70 ${ordered ? "list-decimal pl-4" : ""}`}>{items.map((item) => <li key={item} className={ordered ? "pl-1" : "flex gap-2 before:mt-2 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-brand"}>{item}</li>)}</Component></div>;
}
