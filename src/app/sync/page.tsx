"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/glass/PageHeader";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { SyncDiffModal, type DiffReview, type DiffTrack } from "@/components/glass/SyncDiffModal";
import { useWorkspace } from "@/components/shell/Workspace";
import { api } from "@/lib/client-api";
import { formatTime, providerLabel } from "@/lib/utils";

interface Rules {
  skipDuplicates: boolean;
  ignoreRemixes: boolean;
  ignoreLive: boolean;
  insert: "append" | "prepend";
  removeExtras: boolean;
}

interface SyncTask {
  id: string;
  name: string;
  sourceProvider: string;
  sourcePlaylistId: string;
  destProvider: string;
  destPlaylistId: string;
  mode: string;
  rules: Rules;
  intervalMinutes: number | null;
  paused: boolean;
  status: string;
  progressJson: string | null;
  lastRunAt: string | null;
  runs: { id: string; startedAt: string; dryRun: boolean; status: string; added: number; removed: number; unchanged: number; needsReview: number }[];
}

interface RunResult {
  dryRun: boolean;
  added: number;
  removed: number;
  unchanged: number;
  needsReview: number;
  log: string[];
  toAdd: DiffTrack[];
  toRemove: DiffTrack[];
  unchangedTracks: DiffTrack[];
  review: DiffReview[];
  backwardAdd: DiffTrack[];
}

const MODES = [
  { id: "delta", label: "Delta" },
  { id: "mirror", label: "Mirror" },
  { id: "merge", label: "Two-way" },
];

export default function SyncPage() {
  const workspace = useWorkspace();
  const [tasks, setTasks] = useState<SyncTask[]>([]);
  const [reviews, setReviews] = useState<{ id: string; source: DiffTrack; candidates: DiffReview["candidates"] }[]>([]);
  const [snapshots, setSnapshots] = useState<{ id: string; label: string; playlistId: string; createdAt: string }[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({
    name: "Playlist copy",
    sourcePlaylistId: "",
    destPlaylistId: "",
    mode: "delta",
    insert: "append" as "append" | "prepend",
    skipDuplicates: true,
    ignoreRemixes: true,
    ignoreLive: true,
    removeExtras: false,
    intervalMinutes: "",
    newPlaylist: "",
  });

  async function load() {
    const [taskBody, reviewBody, snapshotBody] = await Promise.all([
      api<{ tasks: SyncTask[] }>("/api/sync/tasks"),
      api<{ items: { id: string; source: DiffTrack; candidates: DiffReview["candidates"] }[] }>("/api/reviews"),
      api<{ snapshots: { id: string; label: string; playlistId: string; createdAt: string }[] }>("/api/snapshots"),
    ]);
    setTasks(taskBody.tasks);
    setReviews(reviewBody.items);
    setSnapshots(snapshotBody.snapshots);
  }

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load sync."));
  }, []);

  useEffect(() => {
    if (!workspace.playlists.length) return;
    setForm((current) => ({
      ...current,
      sourcePlaylistId: workspace.playlists.some((playlist) => playlist.id === current.sourcePlaylistId)
        ? current.sourcePlaylistId
        : workspace.playlists[0].id,
      destPlaylistId: workspace.playlists.some((playlist) => playlist.id === current.destPlaylistId)
        ? current.destPlaylistId
        : (workspace.playlists[1] || workspace.playlists[0]).id,
    }));
  }, [workspace.playlists]);

  const running = tasks.some((task) => task.status === "running");
  useEffect(() => {
    if (!running && !busy) return;
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 400);
    return () => clearInterval(timer);
  }, [running, busy]);

  const names = useMemo(() => new Map(workspace.playlists.map((playlist) => [playlist.id, playlist])), [workspace.playlists]);

  async function createTask(event: FormEvent) {
    event.preventDefault();
    setError("");
    let destPlaylistId = form.destPlaylistId;
    const dest = names.get(destPlaylistId);
    const source = names.get(form.sourcePlaylistId);
    if (!source) return setError("Pick a source playlist.");
    if (form.newPlaylist.trim()) {
      const created = await api<{ playlist: { id: string } }>("/api/library", {
        method: "POST",
        body: JSON.stringify({ provider: dest?.provider || "apple", name: form.newPlaylist.trim() }),
      });
      destPlaylistId = created.playlist.id;
      await workspace.refresh();
    }
    const destination = names.get(destPlaylistId) || workspace.playlists.find((playlist) => playlist.id === destPlaylistId);
    const provider = destination?.provider || dest?.provider;
    if (!provider) return setError("Pick a destination playlist or type a new name on the destination service.");
    await api("/api/sync/tasks", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        sourceProvider: source.provider,
        sourcePlaylistId: source.id,
        destProvider: provider,
        destPlaylistId,
        mode: form.mode,
        intervalMinutes: form.intervalMinutes ? Number(form.intervalMinutes) : null,
        rules: {
          skipDuplicates: form.skipDuplicates,
          ignoreRemixes: form.ignoreRemixes,
          ignoreLive: form.ignoreLive,
          insert: form.insert,
          removeExtras: form.removeExtras,
        },
      }),
    });
    await load();
  }

  async function run(id: string, dryRun: boolean) {
    setBusy(id + (dryRun ? ":dry" : ":run"));
    setError("");
    try {
      const summary = await api<RunResult>(`/api/sync/tasks/${id}/${dryRun ? "preview" : "run"}`, { method: "POST" });
      setResult(summary);
      await load();
      await workspace.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sync failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Synchronization"
        title="Sync Engine"
        subtitle="Copy once, or keep a playlist paired. Delta appends new tracks. Mirror can remove extras. Two-way merge shares additions without deleting."
      />
      {error ? <p className="mb-4 text-[14px] text-[var(--bad)]">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <GlassSurface>
          {workspace.playlists.length === 0 ? (
            <div className="space-y-3 p-4">
              <h2 className="text-[18px] font-semibold">Connect an account first</h2>
              <p className="text-[13px] leading-snug text-[var(--text-dim)]">Sync tasks copy between playlists on accounts you have authorized.</p>
              <a className="btn btn-primary inline-flex" href="/connections">Open Connections</a>
            </div>
          ) : null}
          <form className="space-y-3 p-4" onSubmit={(event) => void createTask(event)} hidden={workspace.playlists.length === 0}>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em]">New task</h2>
            <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} aria-label="Task name" />
            <label className="block text-[13px] text-[var(--muted)]">
              Source
              <select className="field mt-1" value={form.sourcePlaylistId} onChange={(event) => setForm({ ...form, sourcePlaylistId: event.target.value })}>
                {workspace.playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>{providerLabel(playlist.provider)} · {playlist.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] text-[var(--muted)]">
              Destination
              <select className="field mt-1" value={form.destPlaylistId} onChange={(event) => setForm({ ...form, destPlaylistId: event.target.value })}>
                {workspace.playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>{providerLabel(playlist.provider)} · {playlist.name}</option>
                ))}
              </select>
            </label>
            <input className="field" placeholder="Or create a new playlist with this name" value={form.newPlaylist} onChange={(event) => setForm({ ...form, newPlaylist: event.target.value })} />
            <div className="glass-inset flex rounded-full p-1">
              {MODES.map((mode) => (
                <button type="button" key={mode.id} className="flex-1 rounded-full px-2 py-1.5 text-[13px]" style={{ background: form.mode === mode.id ? "var(--pill)" : "transparent" }} onClick={() => setForm({ ...form, mode: mode.id })}>
                  {mode.label}
                </button>
              ))}
            </div>
            <div className="glass-inset flex rounded-full p-1">
              {(["append", "prepend"] as const).map((insert) => (
                <button type="button" key={insert} className="flex-1 rounded-full px-2 py-1.5 text-[13px] capitalize" style={{ background: form.insert === insert ? "var(--pill)" : "transparent" }} onClick={() => setForm({ ...form, insert })}>
                  {insert}
                </button>
              ))}
            </div>
            <Check label="Skip duplicates" checked={form.skipDuplicates} onChange={(skipDuplicates) => setForm({ ...form, skipDuplicates })} />
            <Check label="Ignore remixes" checked={form.ignoreRemixes} onChange={(ignoreRemixes) => setForm({ ...form, ignoreRemixes })} />
            <Check label="Ignore live recordings" checked={form.ignoreLive} onChange={(ignoreLive) => setForm({ ...form, ignoreLive })} />
            <Check label="Mirror removes extras" checked={form.removeExtras} onChange={(removeExtras) => setForm({ ...form, removeExtras })} />
            <input className="field" inputMode="numeric" placeholder="Repeat every N minutes (optional)" value={form.intervalMinutes} onChange={(event) => setForm({ ...form, intervalMinutes: event.target.value })} />
            <button className="btn btn-primary w-full" type="submit">Save task</button>
          </form>
        </GlassSurface>
        <div className="space-y-3">
          {tasks.map((task) => {
            const progress = task.progressJson ? (JSON.parse(task.progressJson) as { phase?: string; completed?: number; total?: number }) : null;
            const ratio = progress?.total ? Math.min(1, (progress.completed || 0) / progress.total) : 0;
            return (
              <GlassSurface key={task.id}>
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{task.name}</h2>
                      <p className="text-[13px] text-[var(--muted)]">
                        {names.get(task.sourcePlaylistId)?.name || task.sourcePlaylistId} → {names.get(task.destPlaylistId)?.name || task.destPlaylistId} · {task.mode}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn" disabled={busy !== ""} onClick={() => void run(task.id, true)}>{busy === task.id + ":dry" ? "Previewing…" : "Dry run"}</button>
                      <button className="btn btn-primary" disabled={busy !== ""} onClick={() => void run(task.id, false)}>{busy === task.id + ":run" ? "Running…" : "Run now"}</button>
                      <button className="btn" onClick={() => void api(`/api/sync/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ paused: !task.paused }) }).then(load)}>
                        {task.paused ? "Resume" : "Pause"}
                      </button>
                    </div>
                  </div>
                  {progress?.phase ? (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[12px] text-[var(--muted)]">
                        <span>{progress.phase}</span>
                        <span className="tabular">{task.status}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(ratio * 100, task.status === "running" ? 12 : 0)}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <ul className="mt-3 space-y-1 text-[13px] text-[var(--text-dim)]">
                    {task.runs.map((run) => (
                      <li key={run.id} className="tabular">
                        {formatTime(run.startedAt)} · {run.dryRun ? "dry run" : "run"} · +{run.added} −{run.removed} ={run.unchanged} · review {run.needsReview} · {run.status}
                      </li>
                    ))}
                  </ul>
                </div>
              </GlassSurface>
            );
          })}
          {reviews.length ? (
            <GlassSurface>
              <div className="p-4">
                <h2 className="mb-3 text-[18px] font-semibold">Review matches</h2>
                <div className="space-y-3">
                  {reviews.map((item) => (
                    <div key={item.id} className="glass-inset rounded-2xl p-3">
                      <p className="font-medium">{item.source.name}</p>
                      <p className="text-[13px] text-[var(--muted)]">{item.source.artists.join(", ")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.candidates.map((candidate) => (
                          <button key={candidate.track.id} className="btn" onClick={() => void api("/api/reviews", { method: "POST", body: JSON.stringify({ id: item.id, action: "match", candidateId: candidate.track.id }) }).then(async () => { await load(); await workspace.refresh(); })}>
                            Use {candidate.track.name} ({Math.round(candidate.score * 100)}%)
                          </button>
                        ))}
                        <button className="btn" onClick={() => void api("/api/reviews", { method: "POST", body: JSON.stringify({ id: item.id, action: "skip" }) }).then(load)}>Skip</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassSurface>
          ) : null}
          {snapshots.length ? (
            <GlassSurface>
              <div className="p-4">
                <h2 className="mb-2 text-[18px] font-semibold">Snapshots</h2>
                <ul className="space-y-2">
                  {snapshots.map((snapshot) => (
                    <li key={snapshot.id} className="flex items-center justify-between gap-3 text-[14px]">
                      <span>{snapshot.label} · {formatTime(snapshot.createdAt)}</span>
                      <button className="btn" onClick={() => void api("/api/snapshots", { method: "POST", body: JSON.stringify({ id: snapshot.id }) }).then(() => workspace.refresh())}>Restore</button>
                    </li>
                  ))}
                </ul>
              </div>
            </GlassSurface>
          ) : null}
        </div>
      </div>
      {result ? (
        <SyncDiffModal
          title={result.dryRun ? "Dry-run diff" : "Sync applied"}
          dryRun={result.dryRun}
          added={[...result.toAdd, ...result.backwardAdd]}
          removed={result.toRemove}
          unchanged={result.unchangedTracks}
          review={result.review}
          log={result.log}
          onClose={() => setResult(null)}
        />
      ) : null}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[14px]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
