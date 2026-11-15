import { matchTrack } from "@/lib/matching/matchTrack";
import type { Track } from "@/lib/providers/types";

export type DiffTier = "id" | "isrc" | "metadata";

export interface DiffRow {
  status: "added" | "removed" | "unchanged";
  track: Track;
  counterpart?: Track;
  confidence?: number;
  tier?: DiffTier;
  duplicate?: boolean;
}

export interface PlaylistDiff {
  added: DiffRow[];
  removed: DiffRow[];
  unchanged: DiffRow[];
}

const TIER_RANK: Record<DiffTier, number> = { id: 3, isrc: 2, metadata: 1 };

export function computePlaylistDiff(
  source: Track[],
  destination: Track[],
  options?: { skipDuplicates?: boolean },
): PlaylistDiff {
  const skipDuplicates = options?.skipDuplicates !== false;
  type Pair = { si: number; di: number; tier: DiffTier; score: number };
  const pairs: Pair[] = [];
  source.forEach((src, si) => {
    destination.forEach((dest, di) => {
      const match = matchTrack(src, dest);
      if (match.tier === "id" || match.tier === "isrc" || match.tier === "metadata") {
        pairs.push({ si, di, tier: match.tier, score: match.score });
      }
    });
  });
  pairs.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.score - a.score);

  const usedSource = new Set<number>();
  const usedDest = new Set<number>();
  const unchanged: DiffRow[] = [];

  for (const pair of pairs) {
    if (usedSource.has(pair.si)) continue;
    if (usedDest.has(pair.di) && !skipDuplicates) continue;
    const duplicate = usedDest.has(pair.di);
    usedSource.add(pair.si);
    usedDest.add(pair.di);
    unchanged.push({
      status: "unchanged",
      track: source[pair.si],
      counterpart: destination[pair.di],
      confidence: pair.score,
      tier: pair.tier,
      duplicate,
    });
  }

  const added = source
    .map((track, index) => ({ track, index }))
    .filter(({ index }) => !usedSource.has(index))
    .map(({ track }) => ({ status: "added" as const, track }));

  const removed = destination
    .map((track, index) => ({ track, index }))
    .filter(({ index }) => !usedDest.has(index))
    .map(({ track }) => ({ status: "removed" as const, track }));

  return { added, removed, unchanged };
}
