import "server-only";
import { prisma } from "@/lib/db";
import { AppleMusicAdapter } from "@/lib/providers/apple";
import { SpotifyAdapter } from "@/lib/providers/spotify";
import { YouTubeMusicAdapter } from "@/lib/providers/youtube";
import type { MusicProviderAdapter, Playlist, ProviderId, Track } from "@/lib/providers/types";

const registry = new Map<string, () => Promise<MusicProviderAdapter>>();

export function registerProvider(id: string, factory: () => Promise<MusicProviderAdapter>) {
  registry.set(id, factory);
}

export async function getAdapter(provider: ProviderId): Promise<MusicProviderAdapter> {
  if (registry.has(provider)) return registry.get(provider)!();
  const connection = await prisma.connection.findUnique({ where: { provider } });
  if (!connection) {
    throw new Error(`${provider} is not connected. Open Connections and authorize the account.`);
  }
  if (provider === "spotify") return new SpotifyAdapter(connection);
  if (provider === "apple") return new AppleMusicAdapter(connection);
  if (provider === "youtube") return new YouTubeMusicAdapter(connection);
  throw new Error(`No adapter is registered for ${provider}. Implement MusicProviderAdapter and call registerProvider.`);
}

export async function listAllPlaylists(): Promise<{ playlists: Playlist[]; warnings: string[] }> {
  const warnings: string[] = [];
  const playlists: Playlist[] = [];
  for (const provider of ["spotify", "apple", "youtube"] as ProviderId[]) {
    const connection = await prisma.connection.findUnique({ where: { provider } });
    if (!connection) {
      warnings.push(`${provider} is not connected.`);
      continue;
    }
    try {
      const adapter = await getAdapter(provider);
      playlists.push(...(await adapter.fetchPlaylists()));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Failed to load ${provider}.`);
    }
  }
  return { playlists, warnings };
}

export async function tracksForPlaylists(playlistIds: string[], playlists: Playlist[]) {
  const wanted = new Set(playlistIds);
  const selected = playlists.filter((playlist) => wanted.has(playlist.id));
  const grouped = new Map<string, Playlist[]>();
  for (const playlist of selected) {
    const list = grouped.get(playlist.provider) ?? [];
    list.push(playlist);
    grouped.set(playlist.provider, list);
  }
  const rows: Array<Track & { playlistName: string }> = [];
  for (const [provider, lists] of grouped) {
    const adapter = await getAdapter(provider);
    for (const playlist of lists) {
      const tracks = await adapter.fetchPlaylistTracks(playlist.id);
      for (const track of tracks) {
        rows.push({ ...track, playlistId: playlist.id, playlistName: playlist.name });
      }
    }
  }
  const frequency = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.provider}:${row.id}`;
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }
  return rows.map((row) => ({
    ...row,
    frequency: frequency.get(`${row.provider}:${row.id}`) ?? 1,
    instanceId: row.instanceId || `${row.playlistId}:${row.position ?? 0}:${row.id}`,
  }));
}

export type LibraryTrack = Track & { playlistName: string; frequency: number; instanceId: string };
