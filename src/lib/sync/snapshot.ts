import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { MusicProviderAdapter, Track } from "@/lib/providers/types";

export interface SnapshotPayload {
  kind: "tracks" | "demo";
  playlistId: string;
  provider: string;
  tracks: Track[];
}

export async function captureSnapshot(input: {
  adapter: MusicProviderAdapter;
  playlistId: string;
  label: string;
  taskId?: string;
}): Promise<string> {
  const tracks = await input.adapter.fetchPlaylistTracks(input.playlistId);
  const payload: SnapshotPayload = {
    kind: "tracks",
    playlistId: input.playlistId,
    provider: String(input.adapter.id),
    tracks,
  };
  const id = `snap_${randomUUID()}`;
  await prisma.snapshot.create({
    data: {
      id,
      taskId: input.taskId,
      playlistId: input.playlistId,
      provider: String(input.adapter.id),
      label: input.label,
      payloadJson: JSON.stringify(payload),
    },
  });
  return id;
}

export async function restoreSnapshot(id: string) {
  const row = await prisma.snapshot.findUnique({ where: { id } });
  if (!row) throw new Error("Snapshot not found.");
  const payload = JSON.parse(row.payloadJson) as SnapshotPayload;
  if (payload.kind === "demo") {
    throw new Error("This snapshot was saved from a removed local fixture library and cannot be restored.");
  }

  const { getAdapter } = await import("@/lib/providers/registry");
  const adapter = await getAdapter(payload.provider);
  const current = await adapter.fetchPlaylistTracks(payload.playlistId);
  const targetIds = new Set(payload.tracks.map((track) => track.id));
  const currentIds = new Set(current.map((track) => track.id));
  const removeIds = current.filter((track) => !targetIds.has(track.id)).map((track) => track.id);
  const removeInstances = current.filter((track) => !targetIds.has(track.id)).map((track) => track.instanceId || track.id);
  const add = payload.tracks.filter((track) => !currentIds.has(track.id));
  if (removeIds.length) await adapter.removeTracks(payload.playlistId, removeIds, removeInstances);
  if (add.length) await adapter.addTracks(payload.playlistId, add, "append");
  return { restored: payload.tracks.length };
}
