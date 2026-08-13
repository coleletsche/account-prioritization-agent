"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <section className="max-w-xl rounded-card border border-brand/25 bg-white p-8 text-center shadow-card">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-3 text-3xl font-black text-ink">The account list could not be prepared.</h1>
        <p className="mt-3 text-muted">Your source data has not been changed. Try loading the workspace again.</p>
        <button type="button" onClick={reset} className="button-primary mt-6">Try again</button>
      </section>
    </main>
  );
}
