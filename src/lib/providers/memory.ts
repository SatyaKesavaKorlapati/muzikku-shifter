import { randomUUID } from "crypto";
import { rankCandidates } from "@/lib/matching/matchTrack";
import { normalizeIsrc } from "@/lib/matching/normalize";
import type { MetadataQuery, MusicProviderAdapter, Playlist, ProviderId, Track } from "@/lib/providers/types";

export interface Membership {
  instanceId: string;
  playlistId: string;
  trackId: string;
  position: number;
}

export interface MemoryState {
  version: number;
  tracks: Record<string, Track>;
  playlists: Playlist[];
  memberships: Membership[];
}

export interface MemoryLibrary {
  getState(): MemoryState;
  replace(next: MemoryState): void;
  adapter(provider: ProviderId): MusicProviderAdapter;
}

function strip(track: Track): Track {
  return {
    id: track.id,
    provider: track.provider,
    uri: track.uri,
    name: track.name,
    artists: track.artists,
    album: track.album,
    durationMs: track.durationMs,
    isrc: track.isrc,
    artworkUrl: track.artworkUrl,
    explicit: track.explicit,
    isRemix: track.isRemix,
    isLive: track.isLive,
  };
}

export function materialize(state: MemoryState, playlistId: string): Track[] {
  const tracks: Track[] = [];
  const rows = state.memberships
    .filter((membership) => membership.playlistId === playlistId)
    .sort((a, b) => a.position - b.position);
  for (const membership of rows) {
    const track = state.tracks[membership.trackId];
    if (!track) continue;
    tracks.push({
      ...track,
      instanceId: membership.instanceId,
      playlistId,
      position: membership.position,
    });
  }
  return tracks;
}

function reindex(state: MemoryState, playlistId: string) {
  const rows = state.memberships
    .filter((membership) => membership.playlistId === playlistId)
    .sort((a, b) => a.position - b.position);
  rows.forEach((row, index) => {
    row.position = index;
  });
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (playlist) playlist.trackCount = rows.length;
}

export function createMemoryLibrary(initial: MemoryState, onChange?: (state: MemoryState) => void): MemoryLibrary {
  let state = initial;

  function commit() {
    onChange?.(state);
  }

  function adapter(provider: ProviderId): MusicProviderAdapter {
    const displayName = provider === "spotify" ? "Spotify" : provider === "apple" ? "Apple Music" : provider === "youtube" ? "YouTube Music" : provider;
    const catalog = () => Object.values(state.tracks).filter((track) => track.provider === provider);

    return {
      id: provider,
      displayName,
      async fetchPlaylists() {
        return state.playlists
          .filter((playlist) => playlist.provider === provider)
          .map((playlist) => ({
            ...playlist,
            trackCount: state.memberships.filter((membership) => membership.playlistId === playlist.id).length,
          }));
      },
      async fetchPlaylistTracks(playlistId: string) {
        const playlist = state.playlists.find((item) => item.id === playlistId && item.provider === provider);
        if (!playlist) throw new Error(`Playlist ${playlistId} was not found on ${displayName}.`);
        return materialize(state, playlistId);
      },
      async searchTrackByISRC(isrc: string) {
        const needle = normalizeIsrc(isrc);
        if (!needle) return [];
        return catalog().filter((track) => normalizeIsrc(track.isrc) === needle);
      },
      async searchTrackByMetadata(query: MetadataQuery) {
        const probe: Track = {
          id: `probe:${provider}`,
          provider,
          uri: "",
          name: query.title,
          artists: [query.artist],
          album: query.album ?? "",
          durationMs: query.durationMs ?? 0,
          isrc: query.isrc,
        };
        return rankCandidates(probe, catalog(), 5).map((scored) => scored.track);
      },
      async addTracks(playlistId: string, tracks: Track[], position: "append" | "prepend" = "append") {
        const playlist = state.playlists.find((item) => item.id === playlistId && item.provider === provider);
        if (!playlist) throw new Error(`Playlist ${playlistId} was not found on ${displayName}.`);
        let added = 0;
        const existing = new Set(
          state.memberships.filter((membership) => membership.playlistId === playlistId).map((membership) => membership.trackId),
        );
        const incoming: Membership[] = [];
        for (const track of tracks) {
          if (track.provider !== provider) continue;
          if (!state.tracks[track.id]) state.tracks[track.id] = strip(track);
          if (existing.has(track.id)) continue;
          existing.add(track.id);
          incoming.push({
            instanceId: `${playlistId}:${randomUUID()}:${track.id}`,
            playlistId,
            trackId: track.id,
            position: 0,
          });
          added += 1;
        }
        if (position === "prepend") {
          const current = state.memberships.filter((membership) => membership.playlistId === playlistId);
          const others = state.memberships.filter((membership) => membership.playlistId !== playlistId);
          state.memberships = [...others, ...incoming, ...current];
        } else {
          const end = state.memberships.filter((membership) => membership.playlistId === playlistId).length;
          incoming.forEach((row, index) => {
            row.position = end + index;
          });
          state.memberships.push(...incoming);
        }
        reindex(state, playlistId);
        if (added) commit();
        return { added };
      },
      async removeTracks(playlistId: string, trackIds: string[], instanceIds?: string[]) {
        const before = state.memberships.length;
        const instanceSet = new Set(instanceIds ?? []);
        const idSet = new Set(trackIds);
        state.memberships = state.memberships.filter((membership) => {
          if (membership.playlistId !== playlistId) return true;
          if (instanceSet.size > 0) return !instanceSet.has(membership.instanceId);
          return !idSet.has(membership.trackId);
        });
        const removed = before - state.memberships.length;
        reindex(state, playlistId);
        if (removed) commit();
        return { removed };
      },
      async createPlaylist(name: string, description?: string) {
        const playlist: Playlist = {
          id: `${provider}-${randomUUID().slice(0, 8)}`,
          provider,
          name,
          description,
          trackCount: 0,
          owner: "You",
        };
        state.playlists.push(playlist);
        commit();
        return playlist;
      },
    };
  }

  return {
    getState: () => state,
    replace(next: MemoryState) {
      state = next;
      commit();
    },
    adapter,
  };
}
