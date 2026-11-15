"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/glass/PageHeader";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { useWorkspace } from "@/components/shell/Workspace";
import { api } from "@/lib/client-api";
import { providerLabel } from "@/lib/utils";

interface Copy {
  instanceId: string;
  playlistId: string;
  playlistName: string;
  track: { name: string; artists: string[]; provider: string; isrc?: string };
}

interface Group {
  id: string;
  kind: "exact" | "fuzzy";
  scope: "within" | "across";
  reason: string;
  keepInstanceId: string;
  copies: Copy[];
}

export default function DedupePage() {
  const workspace = useWorkspace();
  const [mode, setMode] = useState<"exact" | "fuzzy" | "both">("both");
  const [scope, setScope] = useState<"within" | "across" | "both">("both");
  const [groups, setGroups] = useState<Group[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const ids = workspace.selectedIds.join(",");

  useEffect(() => {
    if (!ids) return;
    void scan();
  }, [ids, mode, scope]);

  async function scan() {
    setScanning(true);
    setMessage("");
    try {
      const result = await api<{ groups: Group[] }>("/api/duplicates", {
        method: "POST",
        body: JSON.stringify({ action: "scan", playlistIds: workspace.selectedIds, mode, scope }),
      });
      setGroups(result.groups);
      const next: Record<string, boolean> = {};
      for (const group of result.groups) {
        for (const copy of group.copies) next[copy.instanceId] = copy.instanceId !== group.keepInstanceId;
      }
      setChecked(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  const removals = new Map<string, string[]>();
  for (const group of groups) {
    for (const copy of group.copies) {
      if (!checked[copy.instanceId] || copy.instanceId === group.keepInstanceId) continue;
      const list = removals.get(copy.playlistId) ?? [];
      if (!list.includes(copy.instanceId)) list.push(copy.instanceId);
      removals.set(copy.playlistId, list);
    }
  }
  const removeCount = [...removals.values()].reduce((sum, list) => sum + list.length, 0);

  async function remove() {
    await api("/api/duplicates", {
      method: "POST",
      body: JSON.stringify({
        action: "remove",
        confirm: true,
        playlistIds: workspace.selectedIds,
        removals: [...removals.entries()].map(([playlistId, instanceIds]) => ({ playlistId, instanceIds })),
      }),
    });
    setConfirm(false);
    await workspace.refresh();
    await scan();
  }

  return (
    <div>
      <PageHeader
        kicker="Cleanup"
        title="Deduplicator"
        subtitle="Exact platform IDs and fuzzy metadata (normalized title, primary artist, duration within 2 seconds, shared ISRC). Nothing is deleted until you confirm."
        actions={<button className="btn btn-primary" onClick={() => void scan()}>{scanning ? "Scanning…" : "Scan workspace"}</button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["both", "exact", "fuzzy"] as const).map((value) => (
          <button key={value} className="chip capitalize" data-on={mode === value} onClick={() => setMode(value)}>{value === "both" ? "Exact + fuzzy" : value}</button>
        ))}
        {(["both", "within", "across"] as const).map((value) => (
          <button key={value} className="chip capitalize" data-on={scope === value} onClick={() => setScope(value)}>
            {value === "within" ? "In one playlist" : value === "across" ? "Across playlists" : "Both scopes"}
          </button>
        ))}
      </div>
      {message ? <p className="mb-3 text-[14px] text-[var(--bad)]">{message}</p> : null}
      <div className="space-y-3">
        {groups.map((group) => (
          <GlassSurface key={group.id}>
            <div className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="chip" data-on="true">{group.kind === "exact" ? "Exact ID" : "Fuzzy"}</span>
                <span className="chip">{group.scope === "within" ? "In one playlist" : "Across playlists"}</span>
                <span className="text-[13px] text-[var(--muted)]">{group.reason}</span>
              </div>
              <ul className="space-y-2">
                {group.copies.map((copy) => {
                  const keep = copy.instanceId === group.keepInstanceId;
                  return (
                    <li key={copy.instanceId} className="flex items-center gap-3 rounded-2xl px-2 py-2" style={{ background: "var(--row)" }}>
                      <input
                        type="checkbox"
                        aria-label={`Remove ${copy.track.name} from ${copy.playlistName}`}
                        disabled={keep}
                        checked={Boolean(checked[copy.instanceId]) && !keep}
                        onChange={(event) => setChecked((current) => ({ ...current, [copy.instanceId]: event.target.checked }))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{copy.track.name}{keep ? " · keep" : ""}</div>
                        <div className="truncate text-[13px] text-[var(--muted)]">
                          {copy.track.artists.join(", ")} · {copy.playlistName} · {providerLabel(copy.track.provider)}
                          {copy.track.isrc ? ` · ${copy.track.isrc}` : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </GlassSurface>
        ))}
        {groups.length === 0 ? (
          <p className="text-[15px] text-[var(--text-dim)]">
            {workspace.playlists.length === 0
              ? "Connect an account on Connections, then choose playlists. This page only scans real libraries."
              : "No duplicates in the selected playlists for this mode."}
          </p>
        ) : null}
      </div>
      {removeCount > 0 ? (
        <div className="fixed bottom-5 left-1/2 z-30 w-[min(560px,calc(100%-2rem))] -translate-x-1/2">
          <GlassSurface chrome className="rounded-[28px]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-[14px]">{removeCount} copies marked for removal.</p>
              <button className="btn btn-danger" onClick={() => setConfirm(true)}>Review delete</button>
            </div>
            {confirm ? (
              <div className="border-t border-[var(--hairline)] px-4 py-3">
                <p className="text-[14px]">Delete these duplicates from the library? A restorable snapshot is written first.</p>
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-danger" onClick={() => void remove().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Delete failed."))}>Confirm delete</button>
                  <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
                </div>
              </div>
            ) : null}
          </GlassSurface>
        </div>
      ) : null}
    </div>
  );
}
