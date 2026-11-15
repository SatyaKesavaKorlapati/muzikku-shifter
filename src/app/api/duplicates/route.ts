import { findDuplicates } from "@/lib/duplicates/findDuplicates";
import { bootstrap } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { getAdapter, listAllPlaylists, tracksForPlaylists } from "@/lib/providers/registry";
import { captureSnapshot } from "@/lib/sync/snapshot";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureSession();
    await bootstrap();
    const body = (await request.json()) as {
      action?: "scan" | "remove";
      playlistIds?: string[];
      mode?: "exact" | "fuzzy" | "both";
      scope?: "within" | "across" | "both";
      confirm?: boolean;
      removals?: { playlistId: string; instanceIds: string[] }[];
    };
    const { playlists } = await listAllPlaylists();
    const ids = body.playlistIds ?? [];
    if (body.action === "remove") {
      if (!body.confirm) return fail("Confirm the batch delete before removing duplicates.");
      const snapshots: string[] = [];
      let removed = 0;
      for (const removal of body.removals ?? []) {
        const playlist = playlists.find((item) => item.id === removal.playlistId);
        if (!playlist) continue;
        const adapter = await getAdapter(playlist.provider);
        const snapshotId = await captureSnapshot({
          adapter,
          playlistId: playlist.id,
          label: "Before duplicate removal",
        });
        snapshots.push(snapshotId);
        const result = await adapter.removeTracks(playlist.id, [], removal.instanceIds);
        removed += result.removed;
      }
      return ok({ removed, snapshots });
    }
    const tracks = await tracksForPlaylists(
      ids,
      playlists,
    );
    const groups = findDuplicates({
      tracks: tracks.map((track) => ({
        ...track,
        playlistId: track.playlistId || "",
        playlistName: track.playlistName,
        instanceId: track.instanceId,
      })),
      mode: body.mode ?? "both",
      scope: body.scope ?? "both",
    });
    return ok({ groups });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function GET() {
  try {
    await ensureSession();
    const runs = await prisma.syncRun.findMany({ take: 1 });
    return ok({ ok: true, runs: runs.length });
  } catch (error) {
    return fail(error, 500);
  }
}
