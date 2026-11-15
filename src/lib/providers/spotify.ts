import "server-only";
import type { Connection } from "@prisma/client";
import { chunk } from "@/lib/utils";
import { annotateTrack } from "@/lib/matching/matchTrack";
import { providerFetch, readJson } from "@/lib/providers/http";
import { refreshSpotify } from "@/lib/providers/auth";
import type { MetadataQuery, MusicProviderAdapter, Playlist, Track } from "@/lib/providers/types";

interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit?: boolean;
  external_ids?: { isrc?: string };
  artists: { name: string }[];
  album: { name: string; images?: { url: string }[] };
}

interface SpotifyPlaylistItem {
  track: SpotifyTrack | null;
}

export class SpotifyAdapter implements MusicProviderAdapter {
  readonly id = "spotify" as const;
  readonly displayName = "Spotify";
  constructor(private connection: Connection) {}

  private async token() {
    return refreshSpotify(this.connection);
  }

  private async get<T>(path: string): Promise<T> {
    const token = await this.token();
    const response = await providerFetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return readJson<T>(response);
  }

  async fetchPlaylists(): Promise<Playlist[]> {
    const playlists: Playlist[] = [];
    let path = "/me/playlists?limit=50";
    while (path) {
      const page = await this.get<{
        items: { id: string; name: string; description: string | null; owner: { display_name?: string }; tracks: { total: number }; images?: { url: string }[] }[];
        next: string | null;
      }>(path);
      for (const item of page.items) {
        playlists.push({
          id: item.id,
          provider: "spotify",
          name: item.name,
          description: item.description ?? undefined,
          trackCount: item.tracks.total,
          artworkUrl: item.images?.[0]?.url,
          owner: item.owner.display_name,
        });
      }
      path = page.next ? page.next.replace("https://api.spotify.com/v1", "") : "";
    }
    const saved = await this.get<{ total: number }>("/me/tracks?limit=1");
    playlists.unshift({
      id: "saved",
      provider: "spotify",
      name: "Liked Songs",
      description: "Spotify saved tracks",
      trackCount: saved.total,
      owner: "You",
    });
    return playlists;
  }

  async fetchPlaylistTracks(playlistId: string): Promise<Track[]> {
    if (playlistId === "saved") return this.fetchSaved();
    const tracks: Track[] = [];
    let path = `/playlists/${playlistId}/tracks?limit=100`;
    let position = 0;
    while (path) {
      const page = await this.get<{ items: SpotifyPlaylistItem[]; next: string | null }>(path);
      for (const item of page.items) {
        if (!item.track?.id) continue;
        tracks.push(mapSpotify(item.track, playlistId, position));
        position += 1;
      }
      path = page.next ? page.next.replace("https://api.spotify.com/v1", "") : "";
    }
    return tracks;
  }

  private async fetchSaved(): Promise<Track[]> {
    const tracks: Track[] = [];
    let path = "/me/tracks?limit=50";
    let position = 0;
    while (path) {
      const page = await this.get<{ items: { track: SpotifyTrack }[]; next: string | null }>(path);
      for (const item of page.items) {
        if (!item.track?.id) continue;
        tracks.push(mapSpotify(item.track, "saved", position));
        position += 1;
      }
      path = page.next ? page.next.replace("https://api.spotify.com/v1", "") : "";
    }
    return tracks;
  }

  async searchTrackByISRC(isrc: string): Promise<Track[]> {
    const data = await this.get<{ tracks: { items: SpotifyTrack[] } }>(`/search?type=track&limit=5&q=${encodeURIComponent(`isrc:${isrc}`)}`);
    return data.tracks.items.filter((track) => track.id).map((track) => mapSpotify(track, "", 0));
  }

  async searchTrackByMetadata(query: MetadataQuery): Promise<Track[]> {
    const q = [`track:${query.title}`, `artist:${query.artist}`].join(" ");
    const data = await this.get<{ tracks: { items: SpotifyTrack[] } }>(`/search?type=track&limit=5&q=${encodeURIComponent(q)}`);
    return data.tracks.items.filter((track) => track.id).map((track) => mapSpotify(track, "", 0));
  }

  async addTracks(playlistId: string, tracks: Track[], position: "append" | "prepend" = "append") {
    if (playlistId === "saved") {
      let added = 0;
      for (const part of chunk(tracks, 50)) {
        const token = await this.token();
        const response = await providerFetch("https://api.spotify.com/v1/me/tracks", {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ids: part.map((track) => track.id) }),
        });
        if (!response.ok) throw new Error(await response.text());
        added += part.length;
      }
      return { added };
    }
    let added = 0;
    const groups = chunk(tracks, 100);
    for (let index = 0; index < groups.length; index += 1) {
      const part = groups[index];
      const token = await this.token();
      const body: { uris: string[]; position?: number } = { uris: part.map((track) => track.uri || `spotify:track:${track.id}`) };
      if (position === "prepend") body.position = index === 0 ? 0 : undefined;
      const response = await providerFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      added += part.length;
    }
    return { added };
  }

  async removeTracks(playlistId: string, trackIds: string[], instanceIds?: string[]) {
    if (playlistId === "saved") {
      const token = await this.token();
      const response = await providerFetch("https://api.spotify.com/v1/me/tracks", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: trackIds }),
      });
      if (!response.ok) throw new Error(await response.text());
      return { removed: trackIds.length };
    }
    const targets = (instanceIds?.length ? instanceIds : trackIds.map((id) => id)).map(parseInstance);
    let removed = 0;
    for (const part of chunk(targets, 100)) {
      const token = await this.token();
      const response = await providerFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tracks: part.map((item) => ({
            uri: `spotify:track:${item.trackId}`,
            positions: item.position === undefined ? undefined : [item.position],
          })),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      removed += part.length;
    }
    return { removed };
  }

  async createPlaylist(name: string, description?: string): Promise<Playlist> {
    const me = await this.get<{ id: string }>("/me");
    const token = await this.token();
    const response = await providerFetch(`https://api.spotify.com/v1/users/${me.id}/playlists`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, public: false }),
    });
    const json = await readJson<{ id: string; name: string; description: string | null }>(response);
    return { id: json.id, provider: "spotify", name: json.name, description: json.description ?? description, trackCount: 0, owner: "You" };
  }
}

function mapSpotify(track: SpotifyTrack, playlistId: string, position: number): Track {
  return annotateTrack({
    id: track.id,
    provider: "spotify",
    uri: track.uri,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: track.album?.name ?? "",
    durationMs: track.duration_ms,
    isrc: track.external_ids?.isrc,
    artworkUrl: track.album?.images?.[0]?.url,
    explicit: track.explicit,
    instanceId: playlistId ? `${playlistId}:${position}:${track.id}` : track.id,
    playlistId: playlistId || undefined,
    position,
  });
}

function parseInstance(value: string): { trackId: string; position?: number } {
  const parts = value.split(":");
  if (parts.length >= 3) {
    const position = Number(parts[parts.length - 2]);
    return { trackId: parts[parts.length - 1], position: Number.isFinite(position) ? position : undefined };
  }
  return { trackId: value };
}
