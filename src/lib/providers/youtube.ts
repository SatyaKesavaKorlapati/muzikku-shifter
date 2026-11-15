import "server-only";
import type { Connection } from "@prisma/client";
import { chunk } from "@/lib/utils";
import { annotateTrack } from "@/lib/matching/matchTrack";
import { refreshGoogle } from "@/lib/providers/auth";
import { providerFetch, readJson } from "@/lib/providers/http";
import type { MetadataQuery, MusicProviderAdapter, Playlist, Track } from "@/lib/providers/types";

interface YtPlaylist {
  id: string;
  snippet?: { title?: string; description?: string; thumbnails?: { medium?: { url?: string } } };
  contentDetails?: { itemCount?: number };
}

interface YtItem {
  id: string;
  snippet?: { title?: string; position?: number; resourceId?: { videoId?: string }; thumbnails?: { medium?: { url?: string } } };
  contentDetails?: { videoId?: string };
}

export class YouTubeMusicAdapter implements MusicProviderAdapter {
  readonly id = "youtube" as const;
  readonly displayName = "YouTube Music";
  constructor(private connection: Connection) {}

  private async token() {
    return refreshGoogle(this.connection);
  }

  private async get<T>(path: string): Promise<T> {
    const token = await this.token();
    const response = await providerFetch(`https://www.googleapis.com/youtube/v3${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return readJson<T>(response);
  }

  async fetchPlaylists(): Promise<Playlist[]> {
    const playlists: Playlist[] = [];
    let pageToken = "";
    do {
      const page = await this.get<{ items?: YtPlaylist[]; nextPageToken?: string }>(
        `/playlists?part=snippet,contentDetails&mine=true&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      for (const item of page.items ?? []) {
        playlists.push({
          id: item.id,
          provider: "youtube",
          name: item.snippet?.title ?? "Untitled",
          description: item.snippet?.description,
          trackCount: item.contentDetails?.itemCount ?? 0,
          artworkUrl: item.snippet?.thumbnails?.medium?.url,
          owner: "You",
        });
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
    return playlists;
  }

  async fetchPlaylistTracks(playlistId: string): Promise<Track[]> {
    const items: YtItem[] = [];
    let pageToken = "";
    do {
      const page = await this.get<{ items?: YtItem[]; nextPageToken?: string }>(
        `/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
    const ids = items.map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId).filter((id): id is string => Boolean(id));
    const details = await this.videoDetails(ids);
    return items.map((item, index) => {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || item.id;
      const detail = details.get(videoId);
      const parsed = splitTitle(detail?.title || item.snippet?.title || "Untitled");
      return annotateTrack({
        id: videoId,
        provider: "youtube",
        uri: `https://www.youtube.com/watch?v=${videoId}`,
        name: parsed.title,
        artists: [parsed.artist],
        album: "",
        durationMs: detail?.durationMs ?? 0,
        artworkUrl: item.snippet?.thumbnails?.medium?.url,
        instanceId: `${playlistId}:${item.snippet?.position ?? index}:${item.id}`,
        playlistId,
        position: item.snippet?.position ?? index,
      });
    });
  }

  async searchTrackByISRC(isrc: string): Promise<Track[]> {
    return this.search(`${isrc} official audio`);
  }

  async searchTrackByMetadata(query: MetadataQuery): Promise<Track[]> {
    return this.search(`${query.artist} ${query.title}`);
  }

  private async search(q: string): Promise<Track[]> {
    const page = await this.get<{ items?: { id?: { videoId?: string } }[] }>(
      `/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(q)}`,
    );
    const ids = (page.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
    const details = await this.videoDetails(ids);
    return ids.map((id, index) => {
      const detail = details.get(id);
      const parsed = splitTitle(detail?.title || "");
      return annotateTrack({
        id,
        provider: "youtube",
        uri: `https://www.youtube.com/watch?v=${id}`,
        name: parsed.title,
        artists: [parsed.artist],
        album: "",
        durationMs: detail?.durationMs ?? 0,
        instanceId: id,
        position: index,
      });
    });
  }

  private async videoDetails(ids: string[]) {
    const map = new Map<string, { title: string; durationMs: number }>();
    for (const part of chunk(ids, 50)) {
      if (!part.length) continue;
      const page = await this.get<{ items?: { id: string; snippet?: { title?: string }; contentDetails?: { duration?: string } }[] }>(
        `/videos?part=snippet,contentDetails&id=${part.join(",")}`,
      );
      for (const item of page.items ?? []) {
        map.set(item.id, { title: item.snippet?.title ?? "", durationMs: isoDuration(item.contentDetails?.duration) });
      }
    }
    return map;
  }

  async addTracks(playlistId: string, tracks: Track[]) {
    let added = 0;
    for (const part of chunk(tracks, 100)) {
      for (const track of part) {
        const token = await this.token();
        const response = await providerFetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            snippet: {
              playlistId,
              resourceId: { kind: "youtube#video", videoId: track.id },
            },
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        added += 1;
      }
    }
    return { added };
  }

  async removeTracks(_playlistId: string, _trackIds: string[], instanceIds?: string[]) {
    const ids = (instanceIds ?? []).map((value) => value.split(":").pop() || "").filter(Boolean);
    let removed = 0;
    for (const id of ids) {
      const token = await this.token();
      const response = await providerFetch(`https://www.googleapis.com/youtube/v3/playlistItems?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok && response.status !== 204) throw new Error(await response.text());
      removed += 1;
    }
    return { removed };
  }

  async createPlaylist(name: string, description?: string): Promise<Playlist> {
    const token = await this.token();
    const response = await providerFetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        snippet: { title: name, description },
        status: { privacyStatus: "private" },
      }),
    });
    const json = await readJson<{ id: string; snippet?: { title?: string; description?: string } }>(response);
    return {
      id: json.id,
      provider: "youtube",
      name: json.snippet?.title ?? name,
      description: json.snippet?.description,
      trackCount: 0,
      owner: "You",
    };
  }
}

function splitTitle(value: string): { artist: string; title: string } {
  const parts = value.split(/\s+[-–—|]\s+/);
  if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(" - ") };
  return { artist: "YouTube", title: value };
}

function isoDuration(value?: string): number {
  if (!value) return 0;
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}
