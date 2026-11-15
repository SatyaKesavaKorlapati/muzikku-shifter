import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[13px] font-medium text-[var(--muted)]">{kicker}</p>
        <h1 className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.025em]">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-[15px] leading-snug text-[var(--text-dim)]">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}
