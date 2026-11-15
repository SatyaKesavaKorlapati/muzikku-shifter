"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="panel rounded-[28px] p-6">
      <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Something went wrong</h1>
      <p className="mt-2 text-[var(--text-dim)]">{error.message}</p>
      <button className="btn mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
