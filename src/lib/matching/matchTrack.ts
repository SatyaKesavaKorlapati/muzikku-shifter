import type { ScoredTrack, Track } from "@/lib/providers/types";
import { normalizeIsrc, normalizeTitle, primaryArtist } from "@/lib/matching/normalize";

export const METADATA_ACCEPT = 0.84;
export const CANDIDATE_FLOOR = 0.4;
export const DURATION_TOLERANCE_MS = 2500;

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (value: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < value.length - 1; i += 1) {
      const gram = value.slice(i, i + 2);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
    return map;
  };
  const left = grams(a);
  const right = grams(b);
  let inter = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const count of left.values()) sizeA += count;
  for (const count of right.values()) sizeB += count;
  for (const [gram, count] of left) inter += Math.min(count, right.get(gram) ?? 0);
  return (2 * inter) / (sizeA + sizeB);
}

export function durationScore(a?: number, b?: number): number {
  if (!a || !b) return 0.5;
  const diff = Math.abs(a - b);
  if (diff <= DURATION_TOLERANCE_MS) return 1;
  if (diff >= 15000) return 0;
  return 1 - (diff - DURATION_TOLERANCE_MS) / (15000 - DURATION_TOLERANCE_MS);
}

export function durationWithin(a: number | undefined, b: number | undefined, tolerance: number): boolean {
  if (!a || !b) return true;
  return Math.abs(a - b) <= tolerance;
}

function artistScore(a: Track, b: Track): number {
  const left = primaryArtist(a.artists);
  const right = primaryArtist(b.artists);
  const pool = [...b.artists.map((name) => normalizeLoose(name)), ...a.artists.map((name) => normalizeLoose(name))];
  let best = similarity(left, right);
  for (const name of b.artists) best = Math.max(best, similarity(left, normalizeLoose(name)));
  for (const name of a.artists) best = Math.max(best, similarity(right, normalizeLoose(name)));
  if (pool.length === 0) return best;
  return best;
}

function normalizeLoose(name: string): string {
  return primaryArtist([name]);
}

export function annotateTrack<T extends Track>(track: T): T {
  const flags = normalizeTitle(track.name);
  return {
    ...track,
    isRemix: track.isRemix || flags.isRemix,
    isLive: track.isLive || flags.isLive,
  };
}

export function matchTrack(a: Track, b: Track): ScoredTrack {
  const left = annotateTrack(a);
  const right = annotateTrack(b);
  const reasons: string[] = [];
  if (left.provider === right.provider && left.id === right.id) {
    reasons.push("Same platform id");
    return { track: right, score: 1, tier: "id", reasons };
  }
  const isrcA = normalizeIsrc(left.isrc);
  const isrcB = normalizeIsrc(right.isrc);
  if (isrcA && isrcA === isrcB) {
    reasons.push(`ISRC ${isrcA}`);
    return { track: right, score: 1, tier: "isrc", reasons };
  }
  const titleA = normalizeTitle(left.name).normalized;
  const titleB = normalizeTitle(right.name).normalized;
  const titleSim = similarity(titleA, titleB);
  const artists = artistScore(left, right);
  const duration = durationScore(left.durationMs, right.durationMs);
  const score = 0.55 * titleSim + 0.35 * artists + 0.1 * duration;
  const durationOk = durationWithin(left.durationMs, right.durationMs, DURATION_TOLERANCE_MS);
  const remixMismatch = Boolean(left.isRemix) !== Boolean(right.isRemix);
  const liveMismatch = Boolean(left.isLive) !== Boolean(right.isLive);
  reasons.push(`Title ${titleSim.toFixed(2)}`, `Artist ${artists.toFixed(2)}`, `Duration ${duration.toFixed(2)}`);
  if (remixMismatch) reasons.push("Remix mismatch");
  if (liveMismatch) reasons.push("Live mismatch");
  const auto =
    titleSim >= 0.88 &&
    artists >= 0.86 &&
    durationOk &&
    !remixMismatch &&
    !liveMismatch &&
    score >= METADATA_ACCEPT &&
    !(isrcA && isrcB && isrcA !== isrcB);
  return {
    track: right,
    score,
    tier: auto ? "metadata" : "none",
    reasons,
  };
}

export function rankCandidates(probe: Track, catalog: Track[], limit = 3): ScoredTrack[] {
  return catalog
    .filter((track) => !(track.provider === probe.provider && track.id === probe.id && track.instanceId === probe.instanceId))
    .map((track) => matchTrack(probe, track))
    .filter((scored) => scored.score >= CANDIDATE_FLOOR || scored.tier === "isrc" || scored.tier === "id")
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function isConfident(scored: ScoredTrack | undefined): scored is ScoredTrack {
  return Boolean(scored && (scored.tier === "id" || scored.tier === "isrc" || scored.tier === "metadata"));
}
