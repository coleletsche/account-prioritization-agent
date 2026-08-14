"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Database, Download, FileWarning, Info, ListChecks, RefreshCw, Search, Signal, SlidersHorizontal, Users } from "lucide-react";
import { processCrmExports, type EntityResolutionResult, type RankedAccount, type ScoreWeights } from "@/lib/data";
import { buildRankingCsv, rankingFilename } from "@/lib/export";
import { getEffectiveReviewQueue } from "@/lib/quality";
import { DEFAULT_WEIGHTS, daysBetween, rankOrganizations } from "@/lib/scoring";
import { AccountDrawer } from "./account-drawer";
import { RankingTable } from "./ranking-table";
import { ReviewQueue } from "./review-queue";
import { UploadDialog } from "./upload-dialog";
import { WeightControls } from "./weight-controls";

const DEFAULT_WEEK = "2026-08-17";
type View = "vp" | string;

function metric(value: string, label: string, detail: string, icon: React.ReactNode, tone = "default", onClick?: () => void) {
  return { value, label, detail, icon, tone, onClick };
}

export function AccountDashboard() {
  const [data, setData] = useState<EntityResolutionResult>();
  const [error, setError] = useState<string>();
  const [weights, setWeights] = useState<ScoreWeights>({ ...DEFAULT_WEIGHTS });
  const [asOfDate, setAsOfDate] = useState(DEFAULT_WEEK);
  const [view, setView] = useState<View>("vp");
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [datasetLabel, setDatasetLabel] = useState("Bundled assessment data");

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

  const visible = useMemo(() => {
    let candidates = view === "vp" ? ranked : ranked.filter((account) => account.organization.owner === view);
    if (view === "vp" && ownerFilter !== "all") candidates = candidates.filter((account) => account.organization.owner === ownerFilter);
    if (tierFilter !== "all") candidates = candidates.filter((account) => account.organization.accountTier === tierFilter);
    if (regionFilter !== "all") candidates = candidates.filter((account) => account.organization.region === regionFilter);
    if (industryFilter !== "all") candidates = candidates.filter((account) => account.organization.industry === industryFilter);
    if (confidenceFilter !== "all") candidates = candidates.filter((account) => account.organization.confidence === confidenceFilter);
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) candidates = candidates.filter((account) => [account.organization.canonicalName, ...account.organization.aliases].some((value) => value.toLowerCase().includes(normalizedQuery)));
    return candidates.slice(0, view === "vp" ? 25 : 10);
  }, [ranked, view, ownerFilter, tierFilter, regionFilter, industryFilter, confidenceFilter, query]);

  if (error) return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12"><section className="max-w-lg rounded-card border border-brand/25 bg-white p-8 text-center shadow-card"><FileWarning className="mx-auto text-brand" size={32} /><h1 className="mt-4 text-3xl font-black text-ink">The CRM exports could not be prepared.</h1><p className="mt-3 text-muted">{error}</p><button type="button" onClick={() => location.reload()} className="button-primary mt-6">Reload workspace</button></section></main>
  );
  if (!data) return <main className="page-shell flex min-h-screen items-center justify-center" aria-live="polite"><div className="text-center"><div className="mx-auto h-2 w-40 overflow-hidden rounded-full bg-blush"><div className="h-full w-1/2 animate-pulse rounded-full bg-brand" /></div><p className="mt-4 font-bold text-muted">Resolving CRM records…</p></div></main>;

  const freshnessDays = data.latestEngagementDate ? daysBetween(data.latestEngagementDate, asOfDate) : undefined;
  const stale = freshnessDays !== undefined && freshnessDays > 14;
  const futureEngagement = freshnessDays !== undefined && freshnessDays < 0;
  const signalCoverage = data.organizations.length === 0 ? 0 : Math.round((data.organizations.filter((organization) => organization.engagements.length > 0).length / data.organizations.length) * 100);
  const metrics = [
    metric(String(ranked.length), "eligible accounts", `${data.statistics.excludedOrganizations} held for review`, <Users size={19} />),
    metric(data.latestEngagementDate ?? "—", "latest engagement", stale ? `${freshnessDays} days before this week` : futureEngagement ? `${Math.abs(freshnessDays)} days after this week · review` : "Source data is current", <CalendarDays size={19} />, stale || futureEngagement ? "warning" : "default"),
    metric(`${signalCoverage}%`, "signal coverage", `${data.statistics.matchedSignals} matched engagement rows`, <Signal size={19} />),
    metric(String(reviewIssues.length), "quality flags", "Open the categorized review queue", <FileWarning size={19} />, "default", () => setReviewOpen(true)),
  ];

  const exportRanking = () => {
    const csv = buildRankingCsv(ranked, { asOfDate, weights, reviewIssues });
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
    setView("vp");
    setQuery("");
    setOwnerFilter("all");
    setTierFilter("all");
    setRegionFilter("all");
    setIndustryFilter("all");
    setConfidenceFilter("all");
    setSelectedId(undefined);
    setUploadOpen(false);
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
            <span className="status-pill">Week of {asOfDate.slice(5)}</span>
          </div>
        </div>
      </header>

      <div className="page-shell py-9 sm:py-12">
        <section className="grid items-end gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="eyebrow">Monday call plan</p>
            <h1 className="mt-4 max-w-4xl text-[clamp(2.75rem,5vw,4rem)] font-black leading-[0.98] tracking-[-0.05em] text-ink">Know who to call <span className="text-brand">first.</span></h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">A transparent weekly account ranking that combines buyer intent, account value, and contact timing—without pretending a heuristic is a conversion probability.</p>
          </div>
          <div className="date-control"><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Prioritization week</p><p className="mt-1 text-sm text-ink">Signals decay relative to this date.</p></div><input aria-label="Prioritization week" type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} /></div>
        </section>

        {stale && <div className="stale-banner mt-7" role="status"><AlertTriangle size={18} /><div><strong>Engagement data is stale for this call week.</strong><span> The latest signal is {freshnessDays} days old, so confirm the CRM export before acting.</span></div></div>}
        {futureEngagement && <div className="stale-banner mt-7" role="status"><AlertTriangle size={18} /><div><strong>Some engagement is dated after this call week.</strong><span> Future signals are excluded from intent scoring and listed in the review queue.</span></div></div>}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Data overview">
          {metrics.map((item) => item.onClick ? <button type="button" onClick={item.onClick} key={item.label} className={`overview-card overview-card-button text-left ${item.tone === "warning" ? "overview-warning" : ""}`}><div className="flex items-start justify-between gap-3"><p className="text-[1.75rem] font-black tracking-[-0.04em] text-ink">{item.value}</p><span className="metric-icon">{item.icon}</span></div><p className="mt-4 text-sm font-extrabold text-ink">{item.label}</p><p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p></button> : <article key={item.label} className={`overview-card ${item.tone === "warning" ? "overview-warning" : ""}`}><div className="flex items-start justify-between gap-3"><p className="text-[1.75rem] font-black tracking-[-0.04em] text-ink">{item.value}</p><span className="metric-icon">{item.icon}</span></div><p className="mt-4 text-sm font-extrabold text-ink">{item.label}</p><p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p></article>)}
        </section>

        <section className="mt-6 flex flex-col gap-3 rounded-[18px] border border-line bg-white px-4 py-3 shadow-card sm:flex-row sm:items-center sm:justify-between" aria-label="Data actions">
          <div className="min-w-0"><p className="truncate text-sm font-extrabold text-ink">{datasetLabel}</p><p className="mt-0.5 text-xs text-muted">Session only · raw files never leave this browser</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-compact" onClick={() => setUploadOpen(true)}><RefreshCw size={15} /> Refresh data</button>
            <button type="button" className="button-compact" onClick={() => setReviewOpen(true)}><ListChecks size={15} /> Review issues</button>
            <button type="button" className="button-compact button-compact-primary" onClick={exportRanking}><Download size={15} /> Export full ranking</button>
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0 rounded-card border border-line bg-white shadow-card">
            <div className="border-b border-line px-5 pt-5 sm:px-7 sm:pt-7">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                <div><p className="eyebrow">Prioritized accounts</p><h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink">{view === "vp" ? "Team overview" : `${view}’s call list`}</h2></div>
                <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Account owner views">
                  <button type="button" role="tab" aria-selected={view === "vp"} className={`view-tab ${view === "vp" ? "view-tab-active" : ""}`} onClick={() => setView("vp")}>VP overview</button>
                  {owners.map((owner) => <button key={owner} type="button" role="tab" aria-selected={view === owner} className={`view-tab ${view === owner ? "view-tab-active" : ""}`} onClick={() => setView(owner)}>{owner}</button>)}
                </div>
              </div>

              <div className="mt-6 grid gap-3 pb-5 sm:grid-cols-2 lg:grid-cols-4">
                <label className="search-field lg:col-span-2"><Search size={16} aria-hidden="true" /><input aria-label="Search accounts" placeholder="Search accounts or aliases" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                {view === "vp" && <select aria-label="Filter by owner" className="filter-select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="all">All owners</option>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select>}
                <select aria-label="Filter by tier" className="filter-select" value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option value="all">All tiers</option>{tiers.map((tier) => <option key={tier}>{tier}</option>)}</select>
                <select aria-label="Filter by region" className="filter-select" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="all">All regions</option>{regions.map((region) => <option key={region}>{region}</option>)}</select>
                <select aria-label="Filter by industry" className="filter-select" value={industryFilter} onChange={(event) => setIndustryFilter(event.target.value)}><option value="all">All industries</option>{industries.map((industry) => <option key={industry}>{industry}</option>)}</select>
                <select aria-label="Filter by confidence" className="filter-select" value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)}><option value="all">All confidence</option><option value="high">High confidence</option><option value="medium">Medium confidence</option><option value="low">Low confidence</option></select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4 text-xs text-muted sm:px-7"><span>Showing {visible.length} of {view === "vp" ? Math.min(25, ranked.length) : ranked.filter((account) => account.organization.owner === view).length} prioritized accounts</span><span className="hidden items-center gap-1.5 sm:flex"><Database size={13} /> {data.statistics.sourceAccountRows + data.statistics.sourceSignalRows} source rows</span></div>
            <RankingTable accounts={visible} showGlobalRank={view === "vp"} onSelect={(account: RankedAccount) => setSelectedId(account.organization.id)} />
          </section>

          <aside className="space-y-6"><WeightControls weights={weights} onChange={setWeights} /><section className="method-card"><div className="flex items-center gap-3"><span className="metric-icon"><SlidersHorizontal size={18} /></span><p className="font-extrabold text-ink">What this score means</p></div><p className="mt-4 text-sm leading-6 text-muted">It is a relative weekly ordering—not a prediction. Every point comes from visible CRM fields and matched engagement.</p><button type="button" className="text-link mt-5" onClick={() => setMethodologyOpen(true)}>See the full methodology</button></section></aside>
        </div>
      </div>

      <AccountDrawer account={selected} onClose={() => setSelectedId(undefined)} />
      {uploadOpen && <UploadDialog open onClose={() => setUploadOpen(false)} onApply={applyUpload} />}
      {reviewOpen && <ReviewQueue open issues={reviewIssues} onClose={() => setReviewOpen(false)} />}

      {methodologyOpen && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button type="button" className="absolute inset-0 bg-ink/55" onClick={() => setMethodologyOpen(false)} aria-label="Dismiss methodology" /><section className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-card bg-white p-7 shadow-2xl sm:p-9" role="dialog" aria-modal="true" aria-labelledby="method-title"><p className="eyebrow">Transparent by design</p><h2 id="method-title" className="mt-3 text-3xl font-black tracking-[-0.04em] text-ink">How the weekly score works</h2><div className="mt-7 grid gap-4 sm:grid-cols-3">{[["Intent", "Weighted event value × log volume × 30-day decay."], ["Account value", "65% tier and 35% ARR proxy, reweighted when data is missing."], ["Contact timing", "Time since last contact, capped at 90 days; missing and future dates are neutral."]].map(([title, body]) => <article className="method-factor" key={title}><h3>{title}</h3><p>{body}</p></article>)}</div><div className="mt-6 rounded-[18px] bg-blush p-5 text-sm leading-6 text-ink"><strong>Important:</strong> ARR is treated as an unconfirmed account-value proxy. Industry and region are filters, not score inputs. Confidence never secretly changes the rank.</div><button type="button" className="button-primary mt-7 w-full" onClick={() => setMethodologyOpen(false)}>Back to the call list</button></section></div>}
    </main>
  );
}
