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
    const tracks = await tracksForPlaylists(ids.length ? ids : playlists.map((playlist) => playlist.id), playlists);
    return ok({ tracks });
  } catch (error) {
    return fail(error, 500);
  }
}
