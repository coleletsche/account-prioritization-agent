"use client";

import { useState } from "react";
import { Bot, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { SalesAgentApiResponseSchema, type SalesAgentApiResponse, type SalesAgentRequest } from "@/lib/agent";

export function RecommendationPanel({ request, result, onResult, canRefresh = true }: { request?: SalesAgentRequest; result: SalesAgentApiResponse; onResult: (result: SalesAgentApiResponse) => void; canRefresh?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [localWarning, setLocalWarning] = useState<string>();
  const generate = async () => {
    if (!request || loading || !canRefresh) return;
    setLoading(true);
    setLocalWarning(undefined);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const parsed = SalesAgentApiResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The recommendation response was invalid.");
      onResult(parsed.data);
    } catch {
      setLocalWarning("AI interpretation is unavailable. The deterministic action plan remains active.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="agent-panel" aria-labelledby="agent-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-white/60!">Sales agent</p>
          <h2 id="agent-heading" className="mt-2 text-2xl font-extrabold tracking-[-0.025em] text-white">Interpret next actions</h2>
        </div>
        <span className="agent-icon"><Bot size={19} /></span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/65">The ranking, scores, and bands stay deterministic. AI only explains why now and suggests a policy-checked action.</p>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-[14px] border border-white/10 bg-white/5 px-3 py-2.5">
        <span className="flex items-center gap-2 text-xs font-bold text-white/65"><ShieldCheck size={14} /> {result.coverage.total} validated accounts</span>
        <span className={`agent-source ${result.source !== "fallback" ? "agent-source-ai" : ""}`}>{result.source === "ai" ? "AI complete" : result.source === "mixed" ? "Mixed coverage" : "Deterministic plan"}</span>
      </div>

      <dl className="agent-coverage mt-4"><div><dt>AI interpreted</dt><dd>{result.coverage.ai}</dd></div><div><dt>Deterministic fallback</dt><dd>{result.coverage.fallback}</dd></div></dl>

      {canRefresh ? <button type="button" className="button-agent mt-5 w-full" onClick={generate} disabled={!request || loading}>{loading ? <><RefreshCw className="animate-spin" size={16} /> Interpreting full account book…</> : <><RefreshCw size={16} /> Refresh account analysis</>}</button>
        : <div className="mt-5 flex items-center gap-2 rounded-[12px] border border-white/10 bg-white/5 p-3 text-xs font-bold text-white/65"><CheckCircle2 size={15} /> VP-managed analysis · read only</div>}

      {(localWarning || result.warning) && <p className="mt-3 text-xs leading-5 text-[#ffd4df]" role="status">{localWarning ?? result.warning}</p>}
      <p className="mt-4 text-[0.6875rem] leading-5 text-white/40">Only validated account summaries are sent. Raw CRM files are not uploaded or persisted.</p>
    </section>
  );
}
