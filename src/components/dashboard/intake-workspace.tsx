"use client";

import Image from "next/image";
import { Bot, Check, Circle, DatabaseZap, ListChecks, LoaderCircle, ShieldCheck } from "lucide-react";
import type { DatasetSession } from "@/lib/reconciliation";
import { DataIntake, type AnalysisOptions } from "./upload-dialog";

export type WorkspacePhase = "input" | "validating" | "analyzing" | "dashboard";
export type AnalysisStage = "scoring" | "ai" | "preparing";

const ANALYSIS_STEPS = ["Validate exports", "Resolve organizations", "Calculate deterministic scores", "Interpret next actions", "Prepare dashboard"] as const;

function stageIndex(stage: AnalysisStage): number {
  if (stage === "scoring") return 2;
  if (stage === "ai") return 3;
  return 4;
}

function BrandHeader() {
  return <header className="border-b border-line bg-white/95"><div className="page-shell flex min-h-[80px] items-center justify-between py-3"><Image src="/brand/velora-logo.svg" alt="Velora" width={192} height={30} preload className="h-auto w-[170px]" /><span className="status-pill hidden sm:inline-flex"><ShieldCheck size={14} /> Session only</span></div></header>;
}

export function IntakeWorkspace({ phase, stage, generatePlans, onAnalyze, onValidatingChange }: { phase: Exclude<WorkspacePhase, "dashboard">; stage: AnalysisStage; generatePlans: boolean; onAnalyze: (session: DatasetSession, label: string, options: AnalysisOptions) => Promise<void>; onValidatingChange: (validating: boolean) => void }) {
  const analyzing = phase === "analyzing";
  const activeStep = stageIndex(stage);
  return (
    <main className="min-h-screen bg-canvas">
      <BrandHeader />
      <div className="page-shell py-8 sm:py-12">
        {!analyzing ? (
          <div className="intake-workspace-grid">
            <section className="intake-primary-card">
              <p className="eyebrow">Account prioritization</p>
              <h1 className="mt-3 max-w-2xl text-[clamp(2.2rem,5vw,3.5rem)] font-black leading-[1.02] tracking-[-0.055em] text-ink">Prepare this account book</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted">Add the two CRM exports. Velora will validate identity, calculate fixed priority scores, and let you generate AI outreach plans when they are useful.</p>
              <div className="mt-7"><DataIntake onAnalyze={onAnalyze} onValidatingChange={onValidatingChange} /></div>
            </section>
            <aside className="intake-trust-panel" aria-label="How analysis works">
              <span className="agent-icon"><Bot size={20} /></span>
              <p className="eyebrow mt-8 text-white/55!">Dependable by design</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-white">Scores stay deterministic.</h2>
              <p className="mt-3 text-sm leading-6 text-white/65">AI interprets the fixed ranking and recommends an action. It cannot change scores, override data-quality blocks, or invent engagement.</p>
              <div className="mt-8 space-y-3">
                {[
                  [DatabaseZap, "Validate and resolve", "Bad or ambiguous records go to human review."],
                  [ListChecks, "Score the full book", "Every eligible organization receives a reproducible rank."],
                  [Bot, "Interpret next actions", "Only compact validated summaries are sent to AI."],
                ].map(([Icon, title, description]) => <div className="intake-trust-row" key={title as string}><Icon size={17} /><div><strong>{title as string}</strong><span>{description as string}</span></div></div>)}
              </div>
            </aside>
          </div>
        ) : (
          <section className="analysis-card" aria-live="polite" aria-labelledby="analysis-title">
            <p className="eyebrow">Account-book analysis</p>
            <h1 id="analysis-title" className="mt-2 text-[clamp(2rem,4vw,3rem)] font-black tracking-[-0.05em] text-ink">Preparing the complete ranking</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{generatePlans ? "Deterministic validation and scoring run first. AI then creates outreach plans without changing the ranking." : "Deterministic validation and scoring are preparing the ranking. AI outreach plans will remain available on demand."}</p>
            <ol className="analysis-steps mt-8">
              {ANALYSIS_STEPS.map((label, index) => {
                const skipped = index === 3 && !generatePlans;
                const complete = !skipped && index < activeStep;
                const active = index === activeStep;
                return <li key={label} className={active ? "analysis-step-active" : complete ? "analysis-step-complete" : skipped ? "analysis-step-skipped" : ""}><span>{complete ? <Check size={15} /> : active ? <LoaderCircle className="animate-spin" size={16} /> : <Circle size={13} />}</span><strong>{label}</strong><small>{skipped ? "Not selected" : complete ? "Complete" : active ? "In progress" : "Waiting"}</small></li>;
              })}
            </ol>
            <div className="privacy-note mt-7"><ShieldCheck size={17} /><span>Keep this tab open. Nothing is saved after the browser session ends.</span></div>
          </section>
        )}
      </div>
    </main>
  );
}
