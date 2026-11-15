"use client";

import { motion } from "framer-motion";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { ProviderMark } from "@/components/glass/ArtTile";
import { formatDuration } from "@/lib/utils";

export interface DiffTrack {
  id: string;
  name: string;
  artists: string[];
  album?: string;
  durationMs: number;
  provider: string;
  isrc?: string;
}

export interface DiffReview {
  source: DiffTrack;
  candidates: { track: DiffTrack; score: number; reasons: string[] }[];
}

export function SyncDiffModal({
  title,
  dryRun,
  added,
  removed,
  unchanged,
  review,
  log,
  onClose,
}: {
  title: string;
  dryRun: boolean;
  added: DiffTrack[];
  removed: DiffTrack[];
  unchanged: DiffTrack[];
  review: DiffReview[];
  log: string[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4 backdrop-blur-md" role="presentation" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="diff-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="max-h-[86vh] w-full max-w-3xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <GlassSurface chrome className="max-h-[86vh] overflow-auto">
          <div className="flex items-start justify-between gap-4 p-6 pb-3">
            <div>
              <p className="text-[13px] text-[var(--muted)]">{dryRun ? "Dry run" : "Sync result"}</p>
              <h2 id="diff-title" className="text-[28px] font-semibold tracking-[-0.025em]">{title}</h2>
            </div>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
          <div className="grid grid-cols-3 gap-3 px-6">
            <Count tone="var(--good)" label="Added" value={added.length} prefix="+" />
            <Count tone="var(--bad)" label="Removed" value={removed.length} prefix="−" />
            <Count tone="var(--muted)" label="Unchanged" value={unchanged.length} prefix="=" />
          </div>
          <div className="space-y-5 p-6">
            <Section title="Added" rows={added} mark="+" tone="var(--good)" />
            <Section title="Removed" rows={removed} mark="−" tone="var(--bad)" />
            <Section title="Unchanged" rows={unchanged.slice(0, 12)} mark="=" tone="var(--muted)" extra={unchanged.length > 12 ? `${unchanged.length - 12} more held` : undefined} />
            {review.length ? (
              <div>
                <h3 className="mb-2 text-[15px] font-semibold">Needs review</h3>
                <div className="space-y-3">
                  {review.map((item) => (
                    <div key={item.source.id + item.source.name} className="glass-inset rounded-2xl p-3">
                      <p className="font-medium">{item.source.name}</p>
                      <p className="text-[13px] text-[var(--muted)]">{item.source.artists.join(", ")} · no confident destination match</p>
                      <ul className="mt-2 space-y-1 text-[13px]">
                        {item.candidates.length === 0 ? <li>No candidates. Skip this track.</li> : null}
                        {item.candidates.map((candidate) => (
                          <li key={candidate.track.id}>
                            {candidate.track.name} · {candidate.track.artists.join(", ")} · <span className="tabular">{Math.round(candidate.score * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {log.length ? (
              <pre className="overflow-auto rounded-2xl bg-black/80 p-3 text-[12px] leading-relaxed text-white">{log.join("\n")}</pre>
            ) : null}
          </div>
        </GlassSurface>
      </motion.div>
    </div>
  );
}

function Count({ label, value, prefix, tone }: { label: string; value: number; prefix: string; tone: string }) {
  return (
    <div className="glass-inset rounded-2xl px-3 py-3">
      <div className="text-[12px] text-[var(--muted)]">{label}</div>
      <div className="tabular text-[28px] font-semibold tracking-[-0.025em]" style={{ color: tone }}>
        {prefix} {value}
      </div>
    </div>
  );
}

function Section({ title, rows, mark, tone, extra }: { title: string; rows: DiffTrack[]; mark: string; tone: string; extra?: string }) {
  if (!rows.length && !extra) return null;
  return (
    <div>
      <h3 className="mb-2 text-[15px] font-semibold">{title}</h3>
      <ul className="space-y-1">
        {rows.map((track) => (
          <li key={`${mark}-${track.provider}-${track.id}-${track.name}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5" style={{ background: "var(--row)" }}>
            <span className="tabular w-4 font-semibold" style={{ color: tone }}>{mark}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate">{track.name}</div>
              <div className="truncate text-[12px] text-[var(--muted)]">{track.artists.join(", ")} · {formatDuration(track.durationMs)}</div>
            </div>
            <ProviderMark provider={track.provider} />
          </li>
        ))}
      </ul>
      {extra ? <p className="mt-2 text-[13px] text-[var(--muted)]">{extra}</p> : null}
    </div>
  );
}
