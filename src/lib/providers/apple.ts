import "server-only";
import { importPKCS8, SignJWT } from "jose";
import type { Connection } from "@prisma/client";
import { chunk } from "@/lib/utils";
import { readApplePrivateKey } from "@/lib/apple-private-key";
import { decryptSecret } from "@/lib/crypto/tokens";
import { annotateTrack } from "@/lib/matching/matchTrack";
import { providerFetch, readJson } from "@/lib/providers/http";
import type { MetadataQuery, MusicProviderAdapter, Playlist, Track } from "@/lib/providers/types";

interface AppleSong {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    isrc?: string;
    artwork?: { url?: string };
  };
}

export async function createAppleDeveloperToken(): Promise<string> {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const pem = readApplePrivateKey();
  if (!teamId || !keyId || !pem) {
    throw new Error("Apple Music credentials are not configured. Set APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.");
  }
  const key = await importPKCS8(pem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("150d")
    .sign(key);
}

export class AppleMusicAdapter implements MusicProviderAdapter {
  readonly id = "apple" as const;
  readonly displayName = "Apple Music";
  constructor(private connection: Connection) {}

  private storefront() {
    return process.env.APPLE_STOREFRONT?.trim() || "us";
  }

  private async headers() {
    const developer = await createAppleDeveloperToken();
    if (!this.connection.accessTokenEnc) throw new Error("Apple Music user token is missing.");
    const user = decryptSecret(this.connection.accessTokenEnc);
    return {
      Authorization: `Bearer ${developer}`,
      "Music-User-Token": user,
    };
  }

  async fetchPlaylists(): Promise<Playlist[]> {
    const headers = await this.headers();
    const playlists: Playlist[] = [];
    let url = "https://api.music.apple.com/v1/me/library/playlists?limit=100";
    while (url) {
      const response = await providerFetch(url, { headers });
      const json = await readJson<{
        data: { id: string; attributes?: { name?: string; description?: { standard?: string }; artwork?: { url?: string } } }[];
        next?: string;
      }>(response);
      for (const item of json.data ?? []) {
        playlists.push({
          id: item.id,
          provider: "apple",
          name: item.attributes?.name ?? "Untitled",
          description: item.attributes?.description?.standard,
          trackCount: 0,
          artworkUrl: artwork(item.attributes?.artwork?.url),
          owner: "You",
        });
      }
      url = json.next ? `https://api.music.apple.com${json.next}` : "";
    }
    return playlists;
  }

  async fetchPlaylistTracks(playlistId: string): Promise<Track[]> {
    const headers = await this.headers();
    const tracks: Track[] = [];
    let url = `https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks?limit=100`;
    let position = 0;
    while (url) {
      const response = await providerFetch(url, { headers });
      const json = await readJson<{ data: AppleSong[]; next?: string }>(response);
      for (const song of json.data ?? []) {
        const mapped = mapApple(song, playlistId, position);
        if (mapped) {
          tracks.push(mapped);
          position += 1;
        }
      }
      url = json.next ? `https://api.music.apple.com${json.next}` : "";
    }
    return tracks;
  }

  async searchTrackByISRC(isrc: string): Promise<Track[]> {
    const headers = await this.headers();
    const response = await providerFetch(
      `https://api.music.apple.com/v1/catalog/${this.storefront()}/songs?filter[isrc]=${encodeURIComponent(isrc)}`,
      { headers },
    );
    const json = await readJson<{ data: AppleSong[] }>(response);
    return (json.data ?? []).map((song, index) => mapApple(song, "", index)).filter((track): track is Track => Boolean(track));
  }

  async searchTrackByMetadata(query: MetadataQuery): Promise<Track[]> {
    const headers = await this.headers();
    const term = `${query.title} ${query.artist}`;
    const response = await providerFetch(
      `https://api.music.apple.com/v1/catalog/${this.storefront()}/search?types=songs&limit=5&term=${encodeURIComponent(term)}`,
      { headers },
    );
    const json = await readJson<{ results?: { songs?: { data: AppleSong[] } } }>(response);
    return (json.results?.songs?.data ?? []).map((song, index) => mapApple(song, "", index)).filter((track): track is Track => Boolean(track));
  }

  async addTracks(playlistId: string, tracks: Track[], position: "append" | "prepend" = "append") {
    const headers = { ...(await this.headers()), "Content-Type": "application/json" };
    let added = 0;
    const groups = chunk(tracks, 100);
    for (const part of groups) {
      const response = await providerFetch(`https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers,
        body: JSON.stringify({ data: part.map((track) => ({ id: track.id, type: "songs" })) }),
      });
      if (!response.ok && response.status !== 204) throw new Error(await response.text());
      added += part.length;
    }
    if (position === "prepend") {
      /* Apple library playlist insert order follows the payload; callers pass source order. */
    }
    return { added };
  }

  async removeTracks(playlistId: string, trackIds: string[]) {
    const headers = { ...(await this.headers()), "Content-Type": "application/json" };
    let removed = 0;
    for (const part of chunk(trackIds, 100)) {
      const response = await providerFetch(`https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ data: part.map((id) => ({ id, type: "library-songs" })) }),
      });
      if (!response.ok && response.status !== 204) throw new Error(await response.text());
      removed += part.length;
    }
    return { removed };
  }

  async createPlaylist(name: string, description?: string): Promise<Playlist> {
    const headers = { ...(await this.headers()), "Content-Type": "application/json" };
    const response = await providerFetch("https://api.music.apple.com/v1/me/library/playlists", {
      method: "POST",
      headers,
      body: JSON.stringify({ attributes: { name, description } }),
    });
    const json = await readJson<{ data?: { id: string; attributes?: { name?: string } }[] }>(response);
    const created = json.data?.[0];
    if (!created) throw new Error("Apple Music did not return a playlist.");
    return { id: created.id, provider: "apple", name: created.attributes?.name ?? name, description, trackCount: 0, owner: "You" };
  }
}

function mapApple(song: AppleSong, playlistId: string, position: number): Track | null {
  if (!song.id || !song.attributes?.name) return null;
  return annotateTrack({
    id: song.id,
    provider: "apple",
    uri: `apple-music:song:${song.id}`,
    name: song.attributes.name,
    artists: [song.attributes.artistName || "Unknown"],
    album: song.attributes.albumName || "",
    durationMs: song.attributes.durationInMillis || 0,
    isrc: song.attributes.isrc,
    artworkUrl: artwork(song.attributes.artwork?.url),
    instanceId: playlistId ? `${playlistId}:${position}:${song.id}` : song.id,
    playlistId: playlistId || undefined,
    position,
  });
}

function artwork(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace("{w}", "300").replace("{h}", "300");
}
