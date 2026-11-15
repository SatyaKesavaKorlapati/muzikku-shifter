import { computePlaylistDiff } from "@/lib/matching/computePlaylistDiff";
import { isConfident, matchTrack, rankCandidates } from "@/lib/matching/matchTrack";
import { annotateTrack } from "@/lib/matching/matchTrack";
import type { MusicProviderAdapter, ScoredTrack, Track } from "@/lib/providers/types";

export type SyncMode = "delta" | "mirror" | "merge";

export interface SyncRules {
  skipDuplicates: boolean;
  ignoreRemixes: boolean;
  ignoreLive: boolean;
  insert: "append" | "prepend";
  removeExtras: boolean;
}

export interface ReviewPlanItem {
  source: Track;
  candidates: ScoredTrack[];
}

export interface DirectionPlan {
  toAdd: Track[];
  toRemove: Track[];
  toReview: ReviewPlanItem[];
  unchanged: number;
  addedRows: Track[];
  removedRows: Track[];
  unchangedRows: Track[];
}

export interface SyncPlan {
  forward: DirectionPlan;
  backward?: DirectionPlan;
}

export function defaultRules(): SyncRules {
  return {
    skipDuplicates: true,
    ignoreRemixes: false,
    ignoreLive: false,
    insert: "append",
    removeExtras: false,
  };
}

export function filterByRules(tracks: Track[], rules: SyncRules): Track[] {
  return tracks.filter((track) => {
    const tagged = annotateTrack(track);
    if (rules.ignoreRemixes && tagged.isRemix) return false;
    if (rules.ignoreLive && tagged.isLive) return false;
    return true;
  });
}

async function resolveToCatalog(track: Track, adapter: MusicProviderAdapter): Promise<{ match?: Track; candidates: ScoredTrack[] }> {
  if (adapter.id === track.provider) {
    return { match: { ...track, provider: adapter.id }, candidates: [] };
  }
  const pool: Track[] = [];
  if (track.isrc) {
    const hits = await adapter.searchTrackByISRC(track.isrc);
    pool.push(...hits);
    const exact = hits.find((hit) => matchTrack(track, hit).tier === "isrc");
    if (exact) return { match: exact, candidates: [] };
  }
  const meta = await adapter.searchTrackByMetadata({
    title: track.name,
    artist: track.artists[0] || "",
    album: track.album,
    durationMs: track.durationMs,
    isrc: track.isrc,
  });
  for (const hit of meta) {
    if (!pool.some((item) => item.id === hit.id)) pool.push(hit);
  }
  const ranked = rankCandidates(track, pool, 3);
  const best = ranked[0];
  if (isConfident(best)) return { match: best.track, candidates: ranked };
  return { candidates: ranked.filter((item) => item.tier !== "id") };
}

export async function planDirection(
  sourceTracks: Track[],
  destinationTracks: Track[],
  destination: MusicProviderAdapter,
  rules: SyncRules,
  mode: SyncMode,
): Promise<DirectionPlan> {
  const source = filterByRules(sourceTracks, rules);
  const dest = filterByRules(destinationTracks, rules);
  const diff = computePlaylistDiff(source, dest, { skipDuplicates: rules.skipDuplicates });
  const toAdd: Track[] = [];
  const toReview: ReviewPlanItem[] = [];
  const seen = new Set(dest.map((track) => `${track.provider}:${track.id}`));

  for (const row of diff.added) {
    const resolved = await resolveToCatalog(row.track, destination);
    if (!resolved.match) {
      toReview.push({ source: row.track, candidates: resolved.candidates });
      continue;
    }
    const key = `${resolved.match.provider}:${resolved.match.id}`;
    if (rules.skipDuplicates && (seen.has(key) || toAdd.some((track) => track.id === resolved.match!.id))) {
      continue;
    }
    seen.add(key);
    toAdd.push(resolved.match);
  }

  const toRemove = mode === "mirror" && rules.removeExtras ? diff.removed.map((row) => row.track) : [];
  return {
    toAdd,
    toRemove,
    toReview,
    unchanged: diff.unchanged.length,
    addedRows: toAdd,
    removedRows: diff.removed.map((row) => row.track),
    unchangedRows: diff.unchanged.map((row) => row.track),
  };
}

export async function buildSyncPlan(input: {
  mode: SyncMode;
  rules: SyncRules;
  sourceTracks: Track[];
  destinationTracks: Track[];
  source: MusicProviderAdapter;
  destination: MusicProviderAdapter;
}): Promise<SyncPlan> {
  const forward = await planDirection(input.sourceTracks, input.destinationTracks, input.destination, input.rules, input.mode);
  if (input.mode !== "merge") return { forward };
  const backward = await planDirection(input.destinationTracks, input.sourceTracks, input.source, { ...input.rules, removeExtras: false }, "delta");
  return { forward, backward };
}
