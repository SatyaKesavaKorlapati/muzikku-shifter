import { durationWithin, matchTrack, similarity } from "@/lib/matching/matchTrack";
import { normalizeIsrc, normalizeTitle, primaryArtist } from "@/lib/matching/normalize";
import type { Track } from "@/lib/providers/types";

export interface DuplicateCopy {
  instanceId: string;
  track: Track;
  playlistId: string;
  playlistName: string;
}

export interface DuplicateGroup {
  id: string;
  kind: "exact" | "fuzzy";
  scope: "within" | "across";
  reason: string;
  playlistId?: string;
  playlistName?: string;
  keepInstanceId: string;
  copies: DuplicateCopy[];
}

export interface DuplicateScanInput {
  tracks: Array<Track & { playlistId: string; playlistName: string; instanceId: string }>;
  mode: "exact" | "fuzzy" | "both";
  scope: "within" | "across" | "both";
}

class UnionFind {
  private parent = new Map<string, string>();
  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }
  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function copyOf(track: DuplicateScanInput["tracks"][number]): DuplicateCopy {
  return {
    instanceId: track.instanceId,
    track,
    playlistId: track.playlistId,
    playlistName: track.playlistName,
  };
}

function finishGroup(
  kind: DuplicateGroup["kind"],
  scope: DuplicateGroup["scope"],
  reason: string,
  copies: DuplicateCopy[],
  playlist?: { id: string; name: string },
): DuplicateGroup | null {
  const unique = new Map<string, DuplicateCopy>();
  for (const copy of copies) unique.set(copy.instanceId, copy);
  const list = [...unique.values()].sort((a, b) => {
    if (a.playlistName !== b.playlistName) return a.playlistName.localeCompare(b.playlistName);
    return (a.track.position ?? 0) - (b.track.position ?? 0);
  });
  if (list.length < 2) return null;
  if (scope === "across" && new Set(list.map((copy) => copy.playlistId)).size < 2) return null;
  return {
    id: `${kind}:${scope}:${list.map((copy) => copy.instanceId).join("|")}`,
    kind,
    scope,
    reason,
    playlistId: playlist?.id,
    playlistName: playlist?.name,
    keepInstanceId: list[0].instanceId,
    copies: list,
  };
}

function fuzzyCompatible(a: Track, b: Track): boolean {
  const isrcA = normalizeIsrc(a.isrc);
  const isrcB = normalizeIsrc(b.isrc);
  if (isrcA && isrcB) return isrcA === isrcB;
  const title = similarity(normalizeTitle(a.name).normalized, normalizeTitle(b.name).normalized);
  const artist = similarity(primaryArtist(a.artists), primaryArtist(b.artists));
  return title >= 0.92 && artist >= 0.9 && durationWithin(a.durationMs, b.durationMs, 2000);
}

export function findDuplicates(input: DuplicateScanInput): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const wantExact = input.mode !== "fuzzy";
  const wantFuzzy = input.mode !== "exact";
  const wantWithin = input.scope !== "across";
  const wantAcross = input.scope !== "within";

  const byPlaylist = new Map<string, DuplicateScanInput["tracks"]>();
  for (const track of input.tracks) {
    const list = byPlaylist.get(track.playlistId) ?? [];
    list.push(track);
    byPlaylist.set(track.playlistId, list);
  }

  if (wantExact && wantWithin) {
    for (const [playlistId, tracks] of byPlaylist) {
      const buckets = new Map<string, DuplicateScanInput["tracks"]>();
      for (const track of tracks) {
        const key = `${track.provider}:${track.id}`;
        const list = buckets.get(key) ?? [];
        list.push(track);
        buckets.set(key, list);
      }
      for (const list of buckets.values()) {
        if (list.length < 2) continue;
        const group = finishGroup(
          "exact",
          "within",
          "Same platform id repeated in one playlist",
          list.map(copyOf),
          { id: playlistId, name: list[0].playlistName },
        );
        if (group) groups.push(group);
      }
    }
  }

  if (wantExact && wantAcross) {
    const buckets = new Map<string, DuplicateScanInput["tracks"]>();
    for (const track of input.tracks) {
      const key = `${track.provider}:${track.id}`;
      const list = buckets.get(key) ?? [];
      list.push(track);
      buckets.set(key, list);
    }
    for (const list of buckets.values()) {
      const playlists = new Set(list.map((track) => track.playlistId));
      if (playlists.size < 2) continue;
      const seen = new Set<string>();
      const representatives = list.filter((track) => {
        if (seen.has(track.playlistId)) return false;
        seen.add(track.playlistId);
        return true;
      });
      const group = finishGroup("exact", "across", "Same platform id appears in multiple playlists", representatives.map(copyOf));
      if (group) groups.push(group);
    }
  }

  const cluster = (tracks: DuplicateScanInput["tracks"], scope: "within" | "across", playlist?: { id: string; name: string }) => {
    const uf = new UnionFind();
    for (const track of tracks) uf.add(track.instanceId);
    for (let i = 0; i < tracks.length; i += 1) {
      for (let j = i + 1; j < tracks.length; j += 1) {
        if (tracks[i].instanceId === tracks[j].instanceId) continue;
        const sameId = tracks[i].provider === tracks[j].provider && tracks[i].id === tracks[j].id;
        if (sameId) continue;
        if (fuzzyCompatible(tracks[i], tracks[j]) || matchTrack(tracks[i], tracks[j]).tier === "isrc") {
          uf.union(tracks[i].instanceId, tracks[j].instanceId);
        }
      }
    }
    const buckets = new Map<string, DuplicateScanInput["tracks"]>();
    for (const track of tracks) {
      const root = uf.find(track.instanceId);
      const list = buckets.get(root) ?? [];
      list.push(track);
      buckets.set(root, list);
    }
    for (const list of buckets.values()) {
      const group = finishGroup(
        "fuzzy",
        scope,
        "Normalized title, primary artist, duration ±2s, or shared ISRC",
        list.map(copyOf),
        playlist,
      );
      if (group) groups.push(group);
    }
  };

  if (wantFuzzy && wantWithin) {
    for (const [playlistId, tracks] of byPlaylist) {
      cluster(tracks, "within", { id: playlistId, name: tracks[0]?.playlistName ?? playlistId });
    }
  }
  if (wantFuzzy && wantAcross) cluster(input.tracks, "across");

  const seen = new Set<string>();
  return groups.filter((group) => {
    const key = `${group.kind}:${group.scope}:${[...group.copies.map((copy) => copy.instanceId)].sort().join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
