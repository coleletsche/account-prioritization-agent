export default function Loading() {
  return (
    <main className="page-shell flex min-h-screen items-center justify-center" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto h-3 w-40 animate-pulse rounded-full bg-blush" />
        <p className="mt-4 font-bold text-muted">Preparing the weekly call list…</p>
      </div>
    </main>
  );
}
