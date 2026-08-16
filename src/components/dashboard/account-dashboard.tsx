"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Bot, CalendarDays, Database, Download, Info, ListChecks, LockKeyhole, RefreshCw, Search, SlidersHorizontal, UserRoundCheck, X } from "lucide-react";
import { buildSalesAgentRequest, deterministicRecommendations, SalesAgentApiResponseSchema, type SalesAgentApiResponse, type SalesAgentRequest } from "@/lib/agent";
import type { EntityResolutionResult, RankedAccount, ScoreWeights } from "@/lib/data";
import { buildRankingCsv, rankingFilename } from "@/lib/export";
import { getEffectiveReviewQueue } from "@/lib/quality";
import { DEFAULT_WEIGHTS, daysBetween, rankOrganizations } from "@/lib/scoring";
import { AccountDrawer } from "./account-drawer";
import { IntakeWorkspace, type AnalysisStage, type WorkspacePhase } from "./intake-workspace";
import { RankingTable } from "./ranking-table";
import { RANKING_PAGE_SIZE, RankingPagination } from "./ranking-pagination";
import { RecommendationPanel } from "./recommendation-panel";
import { ReviewQueue } from "./review-queue";
import { UploadDialog } from "./upload-dialog";
import { useEscape } from "./use-escape";
import { WeightControls } from "./weight-controls";

const DEFAULT_WEEK = "2026-08-17";
type UtilityPanel = "scoring" | "agent" | "data";

function analysisScopeKey(asOfDate: string, weights: ScoreWeights, accounts: RankedAccount[]): string {
  return JSON.stringify({ asOfDate, weights, accounts: accounts.map((account) => [account.organization.id, account.priorityScore]) });
}

function deterministicResponse(request: SalesAgentRequest, warning?: string): SalesAgentApiResponse {
  return {
    recommendations: deterministicRecommendations(request),
    source: "fallback",
    coverage: { total: request.accounts.length, ai: 0, fallback: request.accounts.length },
    ...(warning ? { warning } : {}),
  };
}

async function interpretAccountBook(request: SalesAgentRequest): Promise<SalesAgentApiResponse> {
  const fallback = deterministicResponse(request, "AI interpretation is unavailable. The deterministic action plan remains active.");
  try {
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const parsed = SalesAgentApiResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

function allowPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export function AccountDashboard() {
  const [phase, setPhase] = useState<WorkspacePhase>("input");
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>("scoring");
  const [data, setData] = useState<EntityResolutionResult>();
  const [weights, setWeights] = useState<ScoreWeights>({ ...DEFAULT_WEIGHTS });
  const [asOfDate, setAsOfDate] = useState(DEFAULT_WEEK);
  const [persona, setPersona] = useState("vp");
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>();
  const [datasetLabel, setDatasetLabel] = useState("");
  const [agentResult, setAgentResult] = useState<{ scopeKey: string; response: SalesAgentApiResponse }>();
  const tableStartRef = useRef<HTMLDivElement>(null);
  useEscape(methodologyOpen, () => setMethodologyOpen(false));
  useEscape(Boolean(utilityPanel), () => setUtilityPanel(undefined));

  const ranked = useMemo(() => data ? rankOrganizations(data.organizations, { asOfDate, weights }) : [], [data, asOfDate, weights]);
  const owners = useMemo(() => [...new Set(ranked.map((account) => account.organization.owner as string))].sort(), [ranked]);
  const tiers = useMemo(() => [...new Set(ranked.map((account) => account.organization.accountTier).filter(Boolean) as string[])].sort(), [ranked]);
  const regions = useMemo(() => [...new Set(ranked.map((account) => account.organization.region).filter(Boolean) as string[])].sort(), [ranked]);
  const industries = useMemo(() => [...new Set(ranked.map((account) => account.organization.industry).filter(Boolean) as string[])].sort(), [ranked]);
  const reviewIssues = useMemo(() => data ? getEffectiveReviewQueue(data, asOfDate) : [], [data, asOfDate]);
  const selected = ranked.find((account) => account.organization.id === selectedId);
  const isVp = persona === "vp";
  const personaAccounts = useMemo(() => isVp ? ranked : ranked.filter((account) => account.organization.owner === persona), [ranked, isVp, persona]);
  const agentRequest = useMemo(() => ranked.length > 0 ? buildSalesAgentRequest(ranked, { asOfDate, issues: reviewIssues }) : undefined, [ranked, asOfDate, reviewIssues]);
  const agentScopeKey = useMemo(() => analysisScopeKey(asOfDate, weights, ranked), [asOfDate, weights, ranked]);
  const deterministicAgentResponse = useMemo<SalesAgentApiResponse>(() => agentRequest
    ? deterministicResponse(agentRequest, agentResult ? "The ranking changed. Refresh AI interpretation to update the action rationale." : undefined)
    : { recommendations: [], source: "fallback", coverage: { total: 0, ai: 0, fallback: 0 } }, [agentRequest, agentResult]);
  const activeAgentResponse = agentResult?.scopeKey === agentScopeKey ? agentResult.response : deterministicAgentResponse;
  const recommendations = useMemo(() => new Map(activeAgentResponse.recommendations.map((recommendation) => [recommendation.account_id, recommendation])), [activeAgentResponse]);
  const selectedRecommendation = selected ? recommendations.get(selected.organization.id) : undefined;
  const selectedIssues = selected ? reviewIssues.filter((issue) => issue.entityName === selected.organization.canonicalName) : [];

  const visible = useMemo(() => {
    let candidates = personaAccounts;
    if (isVp && ownerFilter !== "all") candidates = candidates.filter((account) => account.organization.owner === ownerFilter);
    if (tierFilter !== "all") candidates = candidates.filter((account) => account.organization.accountTier === tierFilter);
    if (regionFilter !== "all") candidates = candidates.filter((account) => account.organization.region === regionFilter);
    if (industryFilter !== "all") candidates = candidates.filter((account) => account.organization.industry === industryFilter);
    if (confidenceFilter !== "all") candidates = candidates.filter((account) => account.organization.confidence === confidenceFilter);
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) candidates = candidates.filter((account) => [account.organization.canonicalName, ...account.organization.aliases].some((value) => value.toLowerCase().includes(normalizedQuery)));
    return candidates;
  }, [personaAccounts, isVp, ownerFilter, tierFilter, regionFilter, industryFilter, confidenceFilter, query]);

  const totalPages = Math.max(1, Math.ceil(visible.length / RANKING_PAGE_SIZE));
  const activePage = Math.min(page, totalPages);
  const pageStart = visible.length === 0 ? 0 : (activePage - 1) * RANKING_PAGE_SIZE + 1;
  const pageEnd = Math.min(activePage * RANKING_PAGE_SIZE, visible.length);
  const paginatedAccounts = visible.slice((activePage - 1) * RANKING_PAGE_SIZE, activePage * RANKING_PAGE_SIZE);

  const changePage = (nextPage: number) => {
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
    tableStartRef.current?.scrollIntoView({ block: "start" });
  };

  const resetWorkspace = () => {
    setPersona("vp");
    setQuery("");
    setOwnerFilter("all");
    setTierFilter("all");
    setRegionFilter("all");
    setIndustryFilter("all");
    setConfidenceFilter("all");
    setPage(1);
    setFiltersOpen(false);
    setSelectedId(undefined);
    setUtilityPanel(undefined);
  };

  const returnToPreparation = () => {
    resetWorkspace();
    setData(undefined);
    setWeights({ ...DEFAULT_WEIGHTS });
    setAsOfDate(DEFAULT_WEEK);
    setAnalysisStage("scoring");
    setUploadOpen(false);
    setReplacementBusy(false);
    setReviewOpen(false);
    setMethodologyOpen(false);
    setDatasetLabel("");
    setAgentResult(undefined);
    setPhase("input");
  };

  const prepareDataset = async (nextData: EntityResolutionResult, label: string, replacement = false) => {
    const nextRanked = rankOrganizations(nextData.organizations, { asOfDate, weights });
    if (nextRanked.length === 0) throw new Error("No eligible organizations with an owner were found. Review the export and try again.");
    const nextIssues = getEffectiveReviewQueue(nextData, asOfDate);
    const nextRequest = buildSalesAgentRequest(nextRanked, { asOfDate, issues: nextIssues });
    if (replacement) setReplacementBusy(true);
    else {
      setAnalysisStage("scoring");
      setPhase("analyzing");
      await allowPaint();
    }

    try {
      if (!replacement) {
        setAnalysisStage("ai");
        await allowPaint();
      }
      const response = await interpretAccountBook(nextRequest);
      if (!replacement) {
        setAnalysisStage("preparing");
        await allowPaint();
      }
      setData(nextData);
      setDatasetLabel(label);
      setAgentResult({ scopeKey: analysisScopeKey(asOfDate, weights, nextRanked), response });
      resetWorkspace();
      setUploadOpen(false);
      setPhase("dashboard");
    } finally {
      setReplacementBusy(false);
    }
  };

  if (phase !== "dashboard" || !data) {
    return <IntakeWorkspace phase={phase === "dashboard" ? "input" : phase} stage={analysisStage} onAnalyze={(nextData, label) => prepareDataset(nextData, label)} onValidatingChange={(validating) => setPhase(validating ? "validating" : "input")} />;
  }

  const freshnessDays = data.latestEngagementDate ? daysBetween(data.latestEngagementDate, asOfDate) : undefined;
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

  const changePersona = (nextPersona: string) => {
    setPersona(nextPersona);
    setQuery("");
    setOwnerFilter("all");
    setTierFilter("all");
    setRegionFilter("all");
    setIndustryFilter("all");
    setConfidenceFilter("all");
    setPage(1);
    setFiltersOpen(false);
    setSelectedId(undefined);
    setUtilityPanel(undefined);
  };

  return (
    <main className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="page-shell flex min-h-[80px] items-center justify-between gap-5 py-3">
          <div className="flex items-center gap-5"><button type="button" className="brand-home" onClick={returnToPreparation} aria-label="Return to account preparation"><Image src="/brand/velora-logo.svg" alt="Velora" width={192} height={30} preload className="h-auto w-[150px] sm:w-[180px]" /></button><span className="hidden h-7 w-px bg-line lg:block" /><span className="hidden text-sm font-extrabold text-ink lg:block">Account Priority Agent</span></div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" className="button-ghost hidden sm:inline-flex" onClick={() => setMethodologyOpen(true)}><Info size={16} /> Methodology</button>
            <label className="persona-switcher" title="MVP persona preview; production access would require authentication and role-based permissions"><UserRoundCheck size={16} aria-hidden="true" /><span>View as</span><select aria-label="Select persona" value={persona} onChange={(event) => changePersona(event.target.value)}><option value="vp">VP of Sales</option>{owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select></label>
          </div>
        </div>
      </header>

      <div className="page-shell py-5 sm:py-7">
        <section className="queue-workspace min-w-0 overflow-hidden rounded-card border border-line bg-white shadow-card">
          <div className="queue-heading border-b border-line px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="queue-kicker">{isVp ? "VP workspace" : "Rep workspace"}</span>{!isVp && <span className="read-only-pill"><LockKeyhole size={12} /> Read only</span>}</div><h1 className="mt-2 text-[clamp(2rem,4vw,2.75rem)] font-black leading-tight tracking-[-0.045em] text-ink">{isVp ? "Account ranking" : `${persona}’s account ranking`}</h1><p className="mt-2 text-sm leading-6 text-muted">{isVp ? "The complete eligible account book, ordered by fixed intent, value, and contact-timing rules." : "Your complete VP-published account book with policy-checked next actions."}</p></div>
              <label className={`week-control ${!isVp ? "week-control-locked" : ""}`}><CalendarDays size={16} aria-hidden="true" /><span>Week of</span><input aria-label="Prioritization week" type="date" value={asOfDate} disabled={!isVp} onChange={(event) => setAsOfDate(event.target.value)} /></label>
            </div>
            <div className="queue-toolbar mt-5">
              <div className="queue-source min-w-0">{isVp ? <><Database size={15} /><span className="truncate">{datasetLabel}</span><span className="hidden text-muted md:inline">· session only</span></> : <><LockKeyhole size={15} /><span>{persona} · VP-managed ranking</span></>}</div>
              <div className="flex flex-wrap items-center gap-2"><button type="button" className="button-compact" onClick={() => setUtilityPanel("scoring")}><SlidersHorizontal size={15} /> {isVp ? "Scoring controls" : "Published scoring"}</button><button type="button" className="button-compact button-compact-accent" onClick={() => setUtilityPanel("agent")}><Bot size={15} /> Analysis status</button>{isVp && <button type="button" className="button-compact" onClick={() => setUtilityPanel("data")}><Database size={15} /> Data tools <span className="button-count">{reviewIssues.length}</span></button>}</div>
            </div>
          </div>

          {activeAgentResponse.warning && <div className="queue-warning" role="status"><AlertTriangle size={17} /><div><strong>{activeAgentResponse.source === "mixed" ? "AI coverage is partial." : "Deterministic actions are active."}</strong><span> {activeAgentResponse.warning}</span></div></div>}
          {futureEngagement && <div className="queue-warning" role="status"><AlertTriangle size={17} /><div><strong>Future-dated engagement detected.</strong><span> Those signals are excluded and listed for review.</span></div></div>}

          <div className="border-b border-line px-5 pt-5 sm:px-7"><div className="filter-bar pb-5"><label className="search-field"><Search size={16} aria-hidden="true" /><input aria-label="Search accounts" placeholder="Search accounts or aliases" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label><button type="button" className="button-compact filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={15} /> {filtersOpen ? "Hide filters" : "Filters"}</button>{isVp && <select aria-label="Filter by owner" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={ownerFilter} onChange={(event) => { setOwnerFilter(event.target.value); setPage(1); }}><option value="all">All owners</option>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select>}<select aria-label="Filter by tier" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={tierFilter} onChange={(event) => { setTierFilter(event.target.value); setPage(1); }}><option value="all">All tiers</option>{tiers.map((tier) => <option key={tier}>{tier}</option>)}</select><select aria-label="Filter by region" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={regionFilter} onChange={(event) => { setRegionFilter(event.target.value); setPage(1); }}><option value="all">All regions</option>{regions.map((region) => <option key={region}>{region}</option>)}</select><select aria-label="Filter by industry" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={industryFilter} onChange={(event) => { setIndustryFilter(event.target.value); setPage(1); }}><option value="all">All industries</option>{industries.map((industry) => <option key={industry}>{industry}</option>)}</select><select aria-label="Filter by confidence" className={`filter-select filter-mobile-collapse ${filtersOpen ? "filter-mobile-open" : ""}`} value={confidenceFilter} onChange={(event) => { setConfidenceFilter(event.target.value); setPage(1); }}><option value="all">All confidence</option><option value="high">High confidence</option><option value="medium">Medium confidence</option><option value="low">Low confidence</option></select></div></div>
          <div ref={tableStartRef} className="flex scroll-mt-24 items-center justify-between gap-4 px-5 py-3.5 text-xs text-muted sm:px-7"><span>Showing {pageStart}–{pageEnd} of {visible.length} eligible accounts</span>{isVp && <span className="hidden items-center gap-1.5 sm:flex"><Database size={13} /> {data.statistics.sourceAccountRows + data.statistics.sourceSignalRows} source rows</span>}</div>
          <RankingTable accounts={paginatedAccounts} recommendations={recommendations} showGlobalRank={isVp} onSelect={(account: RankedAccount) => setSelectedId(account.organization.id)} />
          <RankingPagination page={activePage} totalItems={visible.length} onPageChange={changePage} />
        </section>
      </div>

      <AccountDrawer account={selected} recommendation={selectedRecommendation} issues={selectedIssues} recommendationSource={activeAgentResponse.source} onClose={() => setSelectedId(undefined)} />
      {uploadOpen && <UploadDialog open busy={replacementBusy} onClose={() => setUploadOpen(false)} onAnalyze={(nextData, label) => prepareDataset(nextData, label, true)} />}
      {reviewOpen && <ReviewQueue open issues={reviewIssues} onClose={() => setReviewOpen(false)} />}

      {utilityPanel && <div className="fixed inset-0 z-50 flex justify-end"><button type="button" className="absolute inset-0 bg-ink/45 backdrop-blur-[1px]" onClick={() => setUtilityPanel(undefined)} aria-label="Dismiss workspace tools" /><aside className="utility-drawer relative h-full w-full overflow-y-auto bg-white shadow-2xl sm:max-w-[430px]" role="dialog" aria-modal="true" aria-labelledby="utility-title"><div className="utility-drawer-header sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-5 py-5 backdrop-blur sm:px-7"><div><p className="eyebrow">{utilityPanel === "scoring" ? "Ranking strategy" : utilityPanel === "agent" ? "Sales agent" : "CRM workspace"}</p><h2 id="utility-title" className="mt-1.5 text-2xl font-black tracking-[-0.035em] text-ink">{utilityPanel === "scoring" ? (isVp ? "Scoring controls" : "Published scoring") : utilityPanel === "agent" ? "Analysis status" : "Data tools"}</h2></div><button type="button" className="icon-button" onClick={() => setUtilityPanel(undefined)} aria-label="Close workspace tools"><X size={18} /></button></div><div className="space-y-5 p-5 sm:p-7">
        {utilityPanel === "scoring" && (isVp ? <WeightControls weights={weights} onChange={setWeights} /> : <section className="published-strategy-card" aria-label="Published scoring strategy"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="metric-icon"><LockKeyhole size={18} /></span><div><p className="font-extrabold text-ink">Published scoring</p><p className="mt-0.5 text-xs font-bold text-brand">Read only</p></div></div></div><p className="mt-5 text-sm leading-6 text-muted">Your ranking uses the VP’s active strategy. Reps can inspect these weights but cannot change them.</p><dl className="mt-5 grid grid-cols-3 gap-2">{[["Intent", weights.intent], ["Value", weights.value], ["Timing", weights.timing]].map(([label, value]) => <div key={label} className="published-weight"><dt>{label}</dt><dd>{value}%</dd></div>)}</dl></section>)}
        {utilityPanel === "agent" && <RecommendationPanel request={agentRequest} result={activeAgentResponse} canRefresh={isVp} onResult={(response) => setAgentResult({ scopeKey: agentScopeKey, response })} />}
        {utilityPanel === "data" && <section className="data-tools-card" aria-label="Data actions"><div className="flex items-start gap-3"><span className="metric-icon"><Database size={18} /></span><div className="min-w-0"><p className="font-extrabold text-ink">{datasetLabel}</p><p className="mt-1 text-xs leading-5 text-muted">{data.statistics.sourceAccountRows + data.statistics.sourceSignalRows} source rows · latest engagement {data.latestEngagementDate ?? "unknown"}</p></div></div><p className="mt-5 rounded-[14px] bg-blush/60 p-3 text-xs leading-5 text-muted">Uploaded exports stay in browser memory for this session. Raw files are never persisted.</p><div className="mt-5 grid gap-2"><button type="button" className="button-secondary w-full" onClick={() => { setUtilityPanel(undefined); setUploadOpen(true); }}><RefreshCw size={16} /> Replace account book</button><button type="button" className="button-secondary w-full" onClick={() => { setUtilityPanel(undefined); setReviewOpen(true); }}><ListChecks size={16} /> Review issues <span className="button-count">{reviewIssues.length}</span></button><button type="button" className="button-primary w-full" aria-label="Export full ranking" onClick={exportRanking}><Download size={16} /> Export full ranking</button></div></section>}
        <section className="utility-note"><div className="flex items-center gap-3"><span className="metric-icon"><Info size={17} /></span><p className="font-extrabold text-ink">Deterministic ranking</p></div><p className="mt-3 text-sm leading-6 text-muted">The score is a relative ordering, not a conversion prediction. AI can interpret the fixed ranking but cannot change rank or policy.</p><button type="button" className="text-link mt-4" onClick={() => { setUtilityPanel(undefined); setMethodologyOpen(true); }}>See the full methodology</button></section>
      </div></aside></div>}

      {methodologyOpen && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button type="button" className="absolute inset-0 bg-ink/55" onClick={() => setMethodologyOpen(false)} aria-label="Dismiss methodology" /><section className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-card bg-white p-7 shadow-2xl sm:p-9" role="dialog" aria-modal="true" aria-labelledby="method-title"><p className="eyebrow">Transparent by design</p><h2 id="method-title" className="mt-3 text-3xl font-black tracking-[-0.04em] text-ink">How the priority agent works</h2><div className="mt-7 grid gap-4 sm:grid-cols-3">{[["Intent", "Event strength × log frequency × 30-day decay, with a small capped signal-breadth multiplier."], ["Account score", "Available tier and ARR value plus contact staleness; unknown inputs stay unknown and are omitted."], ["AI interpretation", "Explains why now and suggests an action after deterministic score, identity, suppression, and quality policy are fixed."]].map(([title, body]) => <article className="method-factor" key={title}><h3>{title}</h3><p>{body}</p></article>)}</div><div className="mt-6 rounded-[18px] bg-blush p-5 text-sm leading-6 text-ink"><strong>Important:</strong> ARR is an unconfirmed account-value proxy. P0/P1/P2/P3 are fixed score bands, not conversion probabilities. The LLM cannot score, rank, clear warnings, or bypass contact suppression.</div><p className="mt-5 text-xs leading-5 text-muted">Persona switching demonstrates the intended VP and SDR experiences in this MVP. It is not an authentication or authorization boundary; production access would require identity, RBAC, and server-side enforcement.</p><button type="button" className="button-primary mt-7 w-full" onClick={() => setMethodologyOpen(false)}>Back to account ranking</button></section></div>}
    </main>
  );
}
