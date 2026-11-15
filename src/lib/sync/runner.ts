import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getAdapter } from "@/lib/providers/registry";
import { captureSnapshot } from "@/lib/sync/snapshot";
import { buildSyncPlan, defaultRules, type SyncMode, type SyncRules } from "@/lib/sync/plan";
import type { ReviewPlanItem } from "@/lib/sync/plan";
import type { Track } from "@/lib/providers/types";
import { chunk } from "@/lib/utils";

export interface RunSummary {
  runId: string;
  dryRun: boolean;
  status: string;
  added: number;
  removed: number;
  unchanged: number;
  matched: number;
  failed: number;
  needsReview: number;
  snapshotId?: string;
  log: string[];
  toAdd: Track[];
  toRemove: Track[];
  unchangedTracks: Track[];
  review: ReviewPlanItem[];
  backwardAdd: Track[];
}

function parseRules(raw: string): SyncRules {
  try {
    const parsed = JSON.parse(raw) as Partial<SyncRules>;
    return { ...defaultRules(), ...parsed };
  } catch {
    return defaultRules();
  }
}

async function progress(taskId: string, body: Record<string, unknown>) {
  await prisma.syncTask.update({
    where: { id: taskId },
    data: { progressJson: JSON.stringify(body), status: "running" },
  });
}

export async function executeSyncTask(taskId: string, options: { dryRun: boolean }): Promise<RunSummary> {
  const task = await prisma.syncTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Sync task not found.");
  if (task.status === "running" && Date.now() - task.updatedAt.getTime() < 120_000) {
    throw new Error("This task is already running.");
  }

  const rules = parseRules(task.rulesJson);
  const mode = task.mode as SyncMode;
  const log: string[] = [];
  const runId = `run_${randomUUID()}`;
  await prisma.syncRun.create({
    data: { id: runId, taskId, dryRun: options.dryRun, status: "running" },
  });
  await prisma.syncTask.update({
    where: { id: taskId },
    data: { status: "running", paused: false, progressJson: JSON.stringify({ phase: "Reading playlists", completed: 0, total: 1 }) },
  });

  try {
    const source = await getAdapter(task.sourceProvider);
    const destination = await getAdapter(task.destProvider);
    const [sourceTracks, destinationTracks] = await Promise.all([
      source.fetchPlaylistTracks(task.sourcePlaylistId),
      destination.fetchPlaylistTracks(task.destPlaylistId),
    ]);
    log.push(`Read ${sourceTracks.length} source tracks and ${destinationTracks.length} destination tracks.`);
    await progress(taskId, { phase: "Matching", completed: 0, total: sourceTracks.length });

    const plan = await buildSyncPlan({
      mode,
      rules,
      sourceTracks,
      destinationTracks,
      source,
      destination,
    });
    const forward = plan.forward;
    const backwardAdd = plan.backward?.toAdd ?? [];
    log.push(
      `Plan ${mode}: add ${forward.toAdd.length}, remove ${forward.toRemove.length}, unchanged ${forward.unchanged}, review ${forward.toReview.length}.`,
    );
    if (plan.backward) log.push(`Merge return path adds ${backwardAdd.length} to the source.`);

    let snapshotId: string | undefined;
    let added = 0;
    let removed = 0;
    let failed = 0;
    const paused = { current: false };

    const applyAdds = async (adapterName: string, playlistId: string, adapter: typeof destination, tracks: Track[]) => {
      const size = 100;
      const groups = chunk(tracks, size);
      if (groups.length === 0) return;
      for (let index = 0; index < groups.length; index += 1) {
        const fresh = await prisma.syncTask.findUnique({ where: { id: taskId } });
        if (fresh?.paused) {
          paused.current = true;
          log.push("Paused between batches.");
          break;
        }
        await progress(taskId, {
          phase: `Writing ${adapterName}`,
          completed: index,
          total: groups.length,
          cursor: index * size,
        });
        if (!options.dryRun) {
          const result = await adapter.addTracks(playlistId, groups[index], rules.insert);
          added += result.added;
        } else {
          added += groups[index].length;
        }
      }
      await progress(taskId, { phase: `Writing ${adapterName}`, completed: groups.length, total: groups.length });
    };

    if (!options.dryRun && forward.toRemove.length) {
      snapshotId = await captureSnapshot({
        adapter: destination,
        playlistId: task.destPlaylistId,
        label: `Before ${mode} remove`,
        taskId,
      });
      log.push("Saved a snapshot of the destination before removals.");
    }

    await applyAdds(String(destination.displayName), task.destPlaylistId, destination, forward.toAdd);

    if (!paused.current && forward.toRemove.length) {
      if (!options.dryRun) {
        const result = await destination.removeTracks(
          task.destPlaylistId,
          forward.toRemove.map((track) => track.id),
          forward.toRemove.map((track) => track.instanceId || track.id),
        );
        removed += result.removed;
      } else {
        removed += forward.toRemove.length;
      }
      log.push(`${options.dryRun ? "Would remove" : "Removed"} ${forward.toRemove.length} destination tracks.`);
    }

    if (!paused.current && backwardAdd.length) {
      await applyAdds(String(source.displayName), task.sourcePlaylistId, source, backwardAdd);
    }

    if (!options.dryRun) {
      for (const item of forward.toReview) {
        await prisma.reviewItem.create({
          data: {
            id: `rev_${randomUUID()}`,
            taskId,
            runId,
            destProvider: task.destProvider,
            destPlaylistId: task.destPlaylistId,
            sourceTrackJson: JSON.stringify(item.source),
            candidatesJson: JSON.stringify(item.candidates),
            status: "pending",
          },
        });
      }
    }

    const status = paused.current ? "paused" : "completed";
    const summary: RunSummary = {
      runId,
      dryRun: options.dryRun,
      status,
      added: options.dryRun ? forward.toAdd.length + backwardAdd.length : added,
      removed: options.dryRun ? forward.toRemove.length : removed,
      unchanged: forward.unchanged,
      matched: forward.unchanged,
      failed,
      needsReview: forward.toReview.length + (plan.backward?.toReview.length ?? 0),
      snapshotId,
      log,
      toAdd: forward.toAdd,
      toRemove: forward.toRemove,
      unchangedTracks: forward.unchangedRows.slice(0, 200),
      review: [...forward.toReview, ...(plan.backward?.toReview ?? [])],
      backwardAdd,
    };

    await prisma.syncRun.update({
      where: { id: runId },
      data: {
        status,
        finishedAt: new Date(),
        added: summary.added,
        removed: summary.removed,
        unchanged: summary.unchanged,
        matched: summary.matched,
        failed: summary.failed,
        needsReview: summary.needsReview,
        logJson: JSON.stringify({ log, review: summary.review, toAdd: summary.toAdd, toRemove: summary.toRemove }),
        snapshotId,
      },
    });
    await prisma.syncTask.update({
      where: { id: taskId },
      data: {
        status: paused.current ? "paused" : "idle",
        paused: paused.current,
        lastRunAt: new Date(),
        progressJson: JSON.stringify({ phase: status, completed: 1, total: 1 }),
      },
    });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    log.push(message);
    await prisma.syncRun.update({
      where: { id: runId },
      data: { status: "error", finishedAt: new Date(), failed: 1, logJson: JSON.stringify({ log }) },
    });
    await prisma.syncTask.update({
      where: { id: taskId },
      data: { status: "error", progressJson: JSON.stringify({ phase: "error", message }) },
    });
    throw error;
  }
}

export async function runDueTasks() {
  const now = Date.now();
  const tasks = await prisma.syncTask.findMany({ where: { paused: false, status: { not: "running" } } });
  for (const task of tasks) {
    if (!task.intervalMinutes) continue;
    const last = task.lastRunAt?.getTime() ?? 0;
    if (now - last < task.intervalMinutes * 60_000) continue;
    try {
      await executeSyncTask(task.id, { dryRun: false });
    } catch (error) {
      console.error("Scheduled sync failed", task.id, error);
    }
  }
}
