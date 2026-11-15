import { bootstrap } from "@/lib/bootstrap";
import { fail, ok } from "@/lib/http";
import { listAllPlaylists, tracksForPlaylists } from "@/lib/providers/registry";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSession();
    await bootstrap();
    const ids = new URL(request.url).searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
    const { playlists } = await listAllPlaylists();
    const selected = ids.length ? playlists.filter((playlist) => ids.includes(playlist.id)) : [];
    const tracks = await tracksForPlaylists(selected.map((playlist) => playlist.id), playlists);
    const map = new Map<string, { name: string; trackIds: Set<string>; playlists: Set<string>; services: Set<string> }>();
    for (const track of tracks) {
      for (const artist of track.artists) {
        const key = artist.toLowerCase();
        const row = map.get(key) ?? { name: artist, trackIds: new Set<string>(), playlists: new Set<string>(), services: new Set<string>() };
        row.trackIds.add(`${track.provider}:${track.id}`);
        if (track.playlistId) row.playlists.add(track.playlistId);
        row.services.add(String(track.provider));
        map.set(key, row);
      }
    }
    const artists = [...map.values()]
      .map((artist) => ({
        name: artist.name,
        trackCount: artist.trackIds.size,
        playlistCount: artist.playlists.size,
        services: [...artist.services],
      }))
      .sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name));
    return ok({ artists });
  } catch (error) {
    return fail(error, 500);
  }
}
