import Image from "next/image";
import { ArrowRight, Database, SlidersHorizontal } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="page-shell flex h-[84px] items-center justify-between">
          <Image
            src="/brand/velora-logo.svg"
            alt="Velora"
            width={192}
            height={30}
            priority
            className="h-auto w-[168px] sm:w-[192px]"
          />
          <div className="flex items-center gap-3">
            <span className="status-pill hidden sm:inline-flex">Assessment workspace</span>
            <button type="button" className="button-secondary">
              <Database size={16} aria-hidden="true" />
              Refresh data
            </button>
          </div>
        </div>
      </header>

      <div className="page-shell py-10 sm:py-14">
        <section className="grid items-end gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="eyebrow">Weekly sales focus</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.045em] text-ink sm:text-6xl">
              Put the accounts that matter most <span className="text-brand">first.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              A transparent, evidence-backed call list for every SDR—updated from the CRM exports your team already has.
            </p>
          </div>
          <div className="brand-panel">
            <SlidersHorizontal size={22} aria-hidden="true" />
            <p className="mt-8 text-sm text-white/70">Default score</p>
            <p className="mt-1 text-2xl font-extrabold">55% intent · 30% value · 15% timing</p>
          </div>
        </section>

        <section className="mt-12 grid gap-5 md:grid-cols-3" aria-label="Prioritization overview">
          {[
            ["286", "resolved organizations", "Cleaned from 300 CRM account rows"],
            ["360", "signals matched", "No engagement records silently lost"],
            ["4", "SDR call lists", "Ten actionable accounts per owner"],
          ].map(([value, label, detail]) => (
            <article key={label} className="metric-card">
              <p className="text-4xl font-black tracking-[-0.04em] text-ink">{value}</p>
              <p className="mt-3 font-bold text-ink">{label}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-card border border-brand/20 bg-white p-7 shadow-card">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <p className="eyebrow">Foundation ready</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.025em] text-ink">The scoring workspace is being assembled.</h2>
              <p className="mt-2 text-muted">Validated ingestion, ranking, and the full SDR workflow arrive in the next verified stages.</p>
            </div>
            <button type="button" className="button-primary">
              View methodology <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
