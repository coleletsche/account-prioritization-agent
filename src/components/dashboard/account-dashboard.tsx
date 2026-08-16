"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CalendarDays, Database, Download, FileWarning, Info, ListChecks, LockKeyhole, RefreshCw, Search, SlidersHorizontal, UserRoundCheck, X } from "lucide-react";
import { buildSalesAgentRequest, deterministicRecommendations, type SalesAgentApiResponse } from "@/lib/agent";
import { processCrmExports, type EntityResolutionResult, type RankedAccount, type ScoreWeights } from "@/lib/data";
import { buildRankingCsv, rankingFilename } from "@/lib/export";
import { getEffectiveReviewQueue } from "@/lib/quality";
import { buildDailyQueues, DEFAULT_WEIGHTS, daysBetween, rankOrganizations } from "@/lib/scoring";
import { AccountDrawer } from "./account-drawer";
import { RankingTable } from "./ranking-table";
import { RecommendationPanel } from "./recommendation-panel";
import { ReviewQueue } from "./review-queue";
import { UploadDialog } from "./upload-dialog";
import { useEscape } from "./use-escape";
import { WeightControls } from "./weight-controls";

const DEFAULT_WEEK = "2026-08-17";
type UtilityPanel = "scoring" | "agent" | "data";

export function AccountDashboard() {
  const [data, setData] = useState<EntityResolutionResult>();
  const [error, setError] = useState<string>();
  const [weights, setWeights] = useState<ScoreWeights>({ ...DEFAULT_WEIGHTS });
  const [asOfDate, setAsOfDate] = useState(DEFAULT_WEEK);
  const [persona, setPersona] = useState("vp");
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>();
  const [datasetLabel, setDatasetLabel] = useState("Bundled assessment data");
  const [agentResult, setAgentResult] = useState<{ scopeKey: string; response: SalesAgentApiResponse }>();
  useEscape(methodologyOpen, () => setMethodologyOpen(false));
  useEscape(Boolean(utilityPanel), () => setUtilityPanel(undefined));

  useEffect(() => {
    let current = true;
    Promise.all([
      fetch("/sample-data/accounts.csv").then((response) => { if (!response.ok) throw new Error("Account export could not be loaded."); return response.text(); }),
      fetch("/sample-data/engagement_signals.json").then((response) => { if (!response.ok) throw new Error("Engagement export could not be loaded."); return response.text(); }),
    ]).then(([accounts, engagements]) => { if (current) setData(processCrmExports(accounts, engagements)); })
      .catch((cause: unknown) => { if (current) setError(cause instanceof Error ? cause.message : "The CRM exports could not be loaded."); });
    return () => { current = false; };
  }, []);

  const ranked = useMemo(() => data ? rankOrganizations(data.organizations, { asOfDate, weights }) : [], [data, asOfDate, weights]);
  const owners = useMemo(() => [...new Set(ranked.map((account) => account.organization.owner as string))].sort(), [ranked]);
  const tiers = useMemo(() => [...new Set(ranked.map((account) => account.organization.accountTier).filter(Boolean) as string[])].sort(), [ranked]);
  const regions = useMemo(() => [...new Set(ranked.map((account) => account.organization.region).filter(Boolean) as string[])].sort(), [ranked]);
  const industries = useMemo(() => [...new Set(ranked.map((account) => account.organization.industry).filter(Boolean) as string[])].sort(), [ranked]);
  const reviewIssues = useMemo(() => data ? getEffectiveReviewQueue(data, asOfDate) : [], [data, asOfDate]);
  const selected = ranked.find((account) => account.organization.id === selectedId);
  const isVp = persona === "vp";
  const personaAccounts = useMemo(() => isVp ? ranked : ranked.filter((account) => account.organization.owner === persona), [ranked, isVp, persona]);
  const dailyQueueAccounts = useMemo(() => {
    if (!isVp) return personaAccounts.slice(0, 10);
    return Object.values(buildDailyQueues(ranked)).flat().sort((left, right) => left.rank - right.rank);
  }, [isVp, personaAccounts, ranked]);
  const agentRequest = useMemo(() => dailyQueueAccounts.length > 0 ? buildSalesAgentRequest(dailyQueueAccounts, { asOfDate, issues: reviewIssues }) : undefined, [dailyQueueAccounts, asOfDate, reviewIssues]);
  const agentScopeKey = useMemo(() => JSON.stringify({ persona, asOfDate, weights, accounts: dailyQueueAccounts.map((account) => [account.organization.id, account.priorityScore]) }), [persona, asOfDate, weights, dailyQueueAccounts]);
  const deterministicAgentResponse = useMemo<SalesAgentApiResponse>(() => ({ recommendations: agentRequest ? deterministicRecommendations(agentRequest) : [], source: "fallback" }), [agentRequest]);
  const activeAgentResponse = agentResult?.scopeKey === agentScopeKey ? agentResult.response : deterministicAgentResponse;
  const recommendations = useMemo(() => new Map(activeAgentResponse.recommendations.map((recommendation) => [recommendation.account_id, recommendation])), [activeAgentResponse]);
  const selectedRecommendation = selected ? recommendations.get(selected.organization.id) : undefined;
  const selectedIssues = selected ? reviewIssues.filter((issue) => issue.entityName === selected.organization.canonicalName) : [];

  const visible = useMemo(() => {
    let candidates = isVp ? ranked : personaAccounts.slice(0, 10);
    if (isVp && ownerFilter !== "all") candidates = candidates.filter((account) => account.organization.owner === ownerFilter);
    if (tierFilter !== "all") candidates = candidates.filter((account) => account.organization.accountTier === tierFilter);
    if (regionFilter !== "all") candidates = candidates.filter((account) => account.organization.region === regionFilter);
    if (industryFilter !== "all") candidates = candidates.filter((account) => account.organization.industry === industryFilter);
    if (confidenceFilter !== "all") candidates = candidates.filter((account) => account.organization.confidence === confidenceFilter);
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) candidates = candidates.filter((account) => [account.organization.canonicalName, ...account.organization.aliases].some((value) => value.toLowerCase().includes(normalizedQuery)));
    return candidates.slice(0, isVp && ownerFilter === "all" ? 25 : 10);
  }, [ranked, personaAccounts, isVp, ownerFilter, tierFilter, regionFilter, industryFilter, confidenceFilter, query]);

  if (error) return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12"><section className="max-w-lg rounded-card border border-brand/25 bg-white p-8 text-center shadow-card"><FileWarning className="mx-auto text-brand" size={32} /><h1 className="mt-4 text-3xl font-black text-ink">The CRM exports could not be prepared.</h1><p className="mt-3 text-muted">{error}</p><button type="button" onClick={() => location.reload()} className="button-primary mt-6">Reload workspace</button></section></main>
  );
  if (!data) return <main className="page-shell flex min-h-screen items-center justify-center" aria-live="polite"><div className="text-center"><div className="mx-auto h-2 w-40 overflow-hidden rounded-full bg-blush"><div className="h-full w-1/2 animate-pulse rounded-full bg-brand" /></div><p className="mt-4 font-bold text-muted">Resolving CRM records…</p></div></main>;

  const freshnessDays = data.latestEngagementDate ? daysBetween(data.latestEngagementDate, asOfDate) : undefined;
  const stale = freshnessDays !== undefined && freshnessDays > 14;
  const futureEngagement = freshnessDays !== undefined && freshnessDays < 0;

  const exportRanking = () => {
    const csv = buildRankingCsv(ranked, { asOfDate, weights, reviewIssues, recommendations });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = rankingFilename(asOfDate);
    link.click();
    URL.revokeObjectURL(url);
  };

  const applyUpload = (nextData: EntityResolutionResult, label: string) => {
    setData(nextData);
    setDatasetLabel(label);
    setPersona("vp");
    setQuery("");
    setOwnerFilter("all");
    setTierFilter("all");
    setRegionFilter("all");
    setIndustryFilter("all");
    setConfidenceFilter("all");
    setFiltersOpen(false);
    setSelectedId(undefined);
    setUploadOpen(false);
  };

  const changePersona = (nextPersona: string) => {
    setPersona(nextPersona);
    setQuery("");
    setOwnerFilter("all");
    setTierFilter("all");
    setRegionFilter("all");
    setIndustryFilter("all");
    setConfidenceFilter("all");
    setFiltersOpen(false);
    setSelectedId(undefined);
    setUtilityPanel(undefined);
  };

  return (
    <main className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="page-shell flex min-h-[80px] items-center justify-between gap-5 py-3">
          <div className="flex items-center gap-5">
            <Image src="/brand/velora-logo.svg" alt="Velora" width={192} height={30} preload className="h-auto w-[150px] sm:w-[180px]" />
            <span className="hidden h-7 w-px bg-line lg:block" />
            <span className="hidden text-sm font-extrabold text-ink lg:block">Account priority</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" className="button-ghost hidden sm:inline-flex" onClick={() => setMethodologyOpen(true)}><Info size={16} /> Methodology</button>
            <label className="persona-switcher" title="MVP persona preview; production access would require authentication and role-based permissions">
              <UserRoundCheck size={16} aria-hidden="true" />
              <span>View as</span>
              <select aria-label="Select persona" value={persona} onChange={(event) => changePersona(event.target.value)}>
                <option value="vp">VP of Sales</option>
                {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
              </select>
            </label>
          </div>
        </div>
      </header>

      <div className="page-shell py-5 sm:py-7">
        <section className="queue-workspace min-w-0 overflow-hidden rounded-card border border-line bg-white shadow-card">
          <div className="queue-heading border-b border-line px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="queue-kicker">{isVp ? "VP workspace" : "Rep workspace"}</span>
                  {!isVp && <span className="read-only-pill"><LockKeyhole size={12} /> Read only</span>}
                </div>
                <h1 className="mt-2 text-[clamp(2rem,4vw,2.75rem)] font-black leading-tight tracking-[-0.045em] text-ink">{isVp ? "Team daily queue" : `${persona}’s daily call queue`}</h1>
                <p className="mt-2 text-sm leading-6 text-muted">{isVp ? "Global Top 25—filter by owner for each rep’s daily Top 10." : "Your VP-published Top 10, with fixed scores and policy-checked next actions."}</p>
              </div>
              <label className={`week-control ${!isVp ? "week-control-locked" : ""}`}>
                <CalendarDays size={16} aria-hidden="true" />
                <span>Week of</span>
                <input aria-label="Prioritization week" type="date" value={asOfDate} disabled={!isVp} onChange={(event) => setAsOfDate(event.target.value)} />
              </label>
            </div>

            <div className="queue-toolbar mt-5">
              <div className="queue-source min-w-0">
                {isVp ? <><Database size={15} /><span className="truncate">{datasetLabel}</span><span className="hidden text-muted md:inline">· session only</span></> : <><LockKeyhole size={15} /><span>{persona} · VP-managed ranking</span></>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="button-compact" onClick={() => setUtilityPanel("scoring")}><SlidersHorizontal size={15} /> {isVp ? "Scoring controls" : "Published scoring"}</button>
                <button type="button" className="button-compact button-compact-accent" onClick={() => setUtilityPanel("agent")}><Bot size={15} /> Agent actions</button>
                {isVp && <button type="button" className="button-compact" onClick={() => setUtilityPanel("data")}><Database size={15} /> Data tools <span className="button-count">{reviewIssues.length}</span></button>}
              </div>
            </div>
          </div>

          {stale && <div className="queue-warning" role="status"><AlertTriangle size={17} /><div><strong>Engagement data is stale.</strong><span> Latest signal is {freshnessDays} days old; confirm the export before acting.</span></div></div>}
          {futureEngagement && <div className="queue-warning" role="status"><AlertTriangle size={17} /><div><strong>Future-dated engagement detected.</strong><span> Those signals are excluded and listed for review.</span></div></div>}

          <div className="border-b border-line px-5 pt-5 sm:px-7">
              <div className="filter-bar pb-5">
                <label className="search-field"><Search size={16} aria-hidden="true" /><input aria-label="Search accounts" placeholder="Search accounts or aliases" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                <button type="button" className="button-compact filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={15} /> {filtersOpen ? "Hide filters" : "Filters"}</button>
                {isVp && <select aria-label="Filter by owner" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="all">All owners</option>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select>}
                <select aria-label="Filter by tier" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option value="all">All tiers</option>{tiers.map((tier) => <option key={tier}>{tier}</option>)}</select>
                <select aria-label="Filter by region" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="all">All regions</option>{regions.map((region) => <option key={region}>{region}</option>)}</select>
                <select aria-label="Filter by industry" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={industryFilter} onChange={(event) => setIndustryFilter(event.target.value)}><option value="all">All industries</option>{industries.map((industry) => <option key={industry}>{industry}</option>)}</select>
                <select aria-label="Filter by confidence" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)}><option value="all">All confidence</option><option value="high">High confidence</option><option value="medium">Medium confidence</option><option value="low">Low confidence</option></select>
              </div>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 text-xs text-muted sm:px-7"><span>Showing {visible.length} of {isVp && ownerFilter === "all" ? Math.min(25, ranked.length) : Math.min(10, personaAccounts.length)} prioritized accounts</span>{isVp && <span className="hidden items-center gap-1.5 sm:flex"><Database size={13} /> {data.statistics.sourceAccountRows + data.statistics.sourceSignalRows} source rows</span>}</div>
          <RankingTable accounts={visible} recommendations={recommendations} showGlobalRank={isVp} onSelect={(account: RankedAccount) => setSelectedId(account.organization.id)} />
        </section>
      </div>

      <AccountDrawer account={selected} recommendation={selectedRecommendation} issues={selectedIssues} recommendationSource={activeAgentResponse.source} onClose={() => setSelectedId(undefined)} />
      {uploadOpen && <UploadDialog open onClose={() => setUploadOpen(false)} onApply={applyUpload} />}
      {reviewOpen && <ReviewQueue open issues={reviewIssues} onClose={() => setReviewOpen(false)} />}

      {utilityPanel && <div className="fixed inset-0 z-50 flex justify-end">
        <button type="button" className="absolute inset-0 bg-ink/45 backdrop-blur-[1px]" onClick={() => setUtilityPanel(undefined)} aria-label="Dismiss workspace tools" />
        <aside className="utility-drawer relative h-full w-full overflow-y-auto bg-white shadow-2xl sm:max-w-[430px]" role="dialog" aria-modal="true" aria-labelledby="utility-title">
          <div className="utility-drawer-header sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
            <div>
              <p className="eyebrow">{utilityPanel === "scoring" ? "Queue strategy" : utilityPanel === "agent" ? "Sales agent" : "CRM workspace"}</p>
              <h2 id="utility-title" className="mt-1.5 text-2xl font-black tracking-[-0.035em] text-ink">{utilityPanel === "scoring" ? (isVp ? "Scoring controls" : "Published scoring") : utilityPanel === "agent" ? "Agent actions" : "Data tools"}</h2>
            </div>
            <button type="button" className="icon-button" onClick={() => setUtilityPanel(undefined)} aria-label="Close workspace tools"><X size={18} /></button>
          </div>
          <div className="space-y-5 p-5 sm:p-7">
            {utilityPanel === "scoring" && (isVp ? <WeightControls weights={weights} onChange={setWeights} /> : <section className="published-strategy-card" aria-label="Published scoring strategy"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="metric-icon"><LockKeyhole size={18} /></span><div><p className="font-extrabold text-ink">Published scoring</p><p className="mt-0.5 text-xs font-bold text-brand">Read only</p></div></div></div><p className="mt-5 text-sm leading-6 text-muted">Your queue uses the VP’s active strategy. Reps can inspect these weights but cannot change them.</p><dl className="mt-5 grid grid-cols-3 gap-2">{[["Intent", weights.intent], ["Value", weights.value], ["Timing", weights.timing]].map(([label, value]) => <div key={label} className="published-weight"><dt>{label}</dt><dd>{value}%</dd></div>)}</dl></section>)}
            {utilityPanel === "agent" && <RecommendationPanel request={agentRequest} result={activeAgentResponse} onResult={(response) => setAgentResult({ scopeKey: agentScopeKey, response })} />}
            {utilityPanel === "data" && <section className="data-tools-card" aria-label="Data actions">
              <div className="flex items-start gap-3"><span className="metric-icon"><Database size={18} /></span><div className="min-w-0"><p className="font-extrabold text-ink">{datasetLabel}</p><p className="mt-1 text-xs leading-5 text-muted">{data.statistics.sourceAccountRows + data.statistics.sourceSignalRows} source rows · latest engagement {data.latestEngagementDate ?? "unknown"}</p></div></div>
              <p className="mt-5 rounded-[14px] bg-blush/60 p-3 text-xs leading-5 text-muted">Uploaded exports stay in browser memory for this session. Raw CRM files are never persisted.</p>
              <div className="mt-5 grid gap-2">
                <button type="button" className="button-secondary w-full" onClick={() => { setUtilityPanel(undefined); setUploadOpen(true); }}><RefreshCw size={16} /> Refresh data</button>
                <button type="button" className="button-secondary w-full" onClick={() => { setUtilityPanel(undefined); setReviewOpen(true); }}><ListChecks size={16} /> Review issues <span className="button-count">{reviewIssues.length}</span></button>
                <button type="button" className="button-primary w-full" aria-label="Export full ranking" onClick={exportRanking}><Download size={16} /> Export full ranking</button>
              </div>
            </section>}
            <section className="utility-note"><div className="flex items-center gap-3"><span className="metric-icon"><Info size={17} /></span><p className="font-extrabold text-ink">Deterministic ranking</p></div><p className="mt-3 text-sm leading-6 text-muted">The score is a relative ordering, not a conversion prediction. AI can interpret the fixed queue but cannot change rank or policy.</p><button type="button" className="text-link mt-4" onClick={() => { setUtilityPanel(undefined); setMethodologyOpen(true); }}>See the full methodology</button></section>
          </div>
        </aside>
      </div>}

      {methodologyOpen && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button type="button" className="absolute inset-0 bg-ink/55" onClick={() => setMethodologyOpen(false)} aria-label="Dismiss methodology" /><section className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-card bg-white p-7 shadow-2xl sm:p-9" role="dialog" aria-modal="true" aria-labelledby="method-title"><p className="eyebrow">Transparent by design</p><h2 id="method-title" className="mt-3 text-3xl font-black tracking-[-0.04em] text-ink">How the priority agent works</h2><div className="mt-7 grid gap-4 sm:grid-cols-3">{[["Intent", "Event strength × log frequency × 30-day decay, with a small capped signal-breadth multiplier."], ["Account score", "Available tier and ARR value plus contact staleness; unknown inputs stay unknown and are omitted."], ["AI interpretation", "Explains why now and suggests an action after deterministic score, identity, suppression, and quality policy are fixed."]].map(([title, body]) => <article className="method-factor" key={title}><h3>{title}</h3><p>{body}</p></article>)}</div><div className="mt-6 rounded-[18px] bg-blush p-5 text-sm leading-6 text-ink"><strong>Important:</strong> ARR is an unconfirmed account-value proxy. P0/P1/P2/P3 are fixed score bands, not conversion probabilities. The LLM cannot score, rank, clear warnings, or bypass contact suppression.</div><p className="mt-5 text-xs leading-5 text-muted">Persona switching demonstrates the intended VP and SDR experiences in this MVP. It is not an authentication or authorization boundary; production access would require identity, RBAC, and server-side enforcement.</p><button type="button" className="button-primary mt-7 w-full" onClick={() => setMethodologyOpen(false)}>Back to the call list</button></section></div>}
    </main>
  );
}
