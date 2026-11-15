import { normalizeIsrc, normalizeTitle } from "@/lib/matching/normalize";
import { bootstrap } from "@/lib/bootstrap";
import { fail, ok } from "@/lib/http";
import { listAllPlaylists, tracksForPlaylists } from "@/lib/providers/registry";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSession();
    await bootstrap();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const ids = url.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
    const { playlists } = await listAllPlaylists();
    const selected = ids.length ? playlists.filter((playlist) => ids.includes(playlist.id)) : playlists;
    const tracks = await tracksForPlaylists(selected.map((playlist) => playlist.id), playlists);
    if (!q) return ok({ tracks: [], playlists: [] });
    const needle = normalizeTitle(q).normalized || q.toLowerCase();
    const isrcNeedle = normalizeIsrc(q);
    const matchedPlaylists = selected.filter((playlist) => normalizeTitle(playlist.name).normalized.includes(needle));
    const playlistHits = new Set(matchedPlaylists.map((playlist) => playlist.id));
    const hits = tracks
      .map((track) => {
        const fields: string[] = [];
        if (normalizeTitle(track.name).normalized.includes(needle)) fields.push("title");
        if (track.artists.some((artist) => normalizeTitle(artist).normalized.includes(needle))) fields.push("artist");
        if (normalizeTitle(track.album).normalized.includes(needle)) fields.push("album");
        if (isrcNeedle && normalizeIsrc(track.isrc).includes(isrcNeedle)) fields.push("isrc");
        if (playlistHits.has(track.playlistId || "")) fields.push("playlist");
        return fields.length ? { ...track, matchedFields: fields } : null;
      })
      .filter((track) => track !== null);
    return ok({ tracks: hits, playlists: matchedPlaylists });
  } catch (error) {
    return fail(error, 500);
  }
}
