import type { ReactNode } from "react";

export function hue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % 360;
}

export function ArtTile({ seed, size = 44, className = "" }: { seed: string; size?: number; className?: string }) {
  const base = hue(seed);
  return (
    <div
      className={`shrink-0 shadow-sm ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size > 56 ? 22 : 12,
        background: `linear-gradient(145deg, hsl(${base} 78% 64%), hsl(${(base + 36) % 360} 70% 42%))`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 8px 16px rgba(0,0,0,0.12)",
      }}
      aria-hidden
    />
  );
}

export function IconTile({ children, tone = "var(--accent)" }: { children: ReactNode; tone?: string }) {
  return (
    <span className="squircle h-9 w-9" style={{ background: `color-mix(in srgb, ${tone} 18%, white)` }}>
      <span style={{ color: tone }}>{children}</span>
    </span>
  );
}

export function providerTone(provider: string): string {
  if (provider === "spotify") return "#1a9f4a";
  if (provider === "apple") return "#e23b4a";
  if (provider === "youtube") return "#d6392b";
  return "#0071e3";
}

export function ProviderMark({ provider }: { provider: string }) {
  const label = provider === "spotify" ? "Spotify" : provider === "apple" ? "Apple Music" : provider === "youtube" ? "YouTube Music" : provider;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-dim)]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: providerTone(provider) }} />
      {label}
    </span>
  );
}
