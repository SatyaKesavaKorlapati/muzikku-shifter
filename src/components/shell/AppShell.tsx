"use client";

import { useState, type ReactNode } from "react";
import { Settings2, Waves } from "lucide-react";
import { GlassPillNav } from "@/components/glass/GlassPillNav";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { AppearanceProvider, useAppearance } from "@/components/shell/Appearance";
import { useWorkspace, WorkspaceProvider } from "@/components/shell/Workspace";
import { api } from "@/lib/client-api";
import { ArtTile, ProviderMark } from "@/components/glass/ArtTile";
import { formatDuration, providerLabel } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppearanceProvider>
      <WorkspaceProvider>
        <AmbientMesh />
        <div className="relative z-10 min-h-screen">
          <TopBar />
          <main className="mx-auto w-full max-w-[1240px] px-4 pb-36 pt-28">{children}</main>
          <BatchDock />
          <TrackSheet />
        </div>
      </WorkspaceProvider>
    </AppearanceProvider>
  );
}

function AmbientMesh() {
  return <div className="mesh" aria-hidden />;
}

function TopBar() {
  const [open, setOpen] = useState(false);
  const appearance = useAppearance();
  return (
    <div className="fixed left-0 right-0 top-4 z-30 flex items-center justify-between gap-3 px-4">
      <GlassSurface chrome className="rounded-full">
        <div className="flex items-center gap-2 px-3 py-2 pr-4">
          <span className="squircle h-8 w-8 bg-[color-mix(in_srgb,#ff8a5b_70%,#7aa2ff)] text-white">
            <Waves size={16} />
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-[-0.025em]">Muzikku Shifter</div>
            <div className="text-[11px] text-[var(--muted)]">Library & sync</div>
          </div>
        </div>
      </GlassSurface>
      <GlassPillNav />
      <div className="relative">
        <button className="btn grid h-11 w-11 place-items-center rounded-full p-0" aria-label="Appearance" onClick={() => setOpen((value) => !value)}>
          <Settings2 size={18} />
        </button>
        {open ? (
          <div className="absolute right-0 top-14 w-72">
            <GlassSurface chrome>
              <div className="space-y-4 p-4">
                <div>
                  <p className="mb-2 text-[13px] font-medium text-[var(--muted)]">Appearance</p>
                  <div className="glass-inset flex rounded-full p-1">
                    {(["light", "dark"] as const).map((theme) => (
                      <button
                        key={theme}
                        className="flex-1 rounded-full px-3 py-1.5 text-[13px] capitalize"
                        style={{ background: appearance.theme === theme ? "var(--pill)" : "transparent", color: appearance.theme === theme ? "var(--pill-text)" : "var(--text-dim)" }}
                        onClick={() => appearance.setTheme(theme)}
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block text-[13px]">
                  <span className="mb-2 flex justify-between text-[var(--muted)]">
                    <span>Glass tint</span>
                    <span className="tabular">{appearance.tint < 35 ? "Clear" : appearance.tint > 70 ? "Frosted" : "Balanced"}</span>
                  </span>
                  <input
                    className="w-full accent-[var(--accent)]"
                    type="range"
                    min={0}
                    max={100}
                    value={appearance.tint}
                    aria-label="Adaptive glass tint"
                    onChange={(event) => appearance.setTint(Number(event.target.value))}
                  />
                  <span className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
                    <span>Clear</span>
                    <span>Tinted</span>
                  </span>
                </label>
              </div>
            </GlassSurface>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BatchDock() {
  const workspace = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const count = workspace.selectedInstances.length;
  if (!count) return null;
  const selected = workspace.tracks.filter((track) => workspace.selectedInstances.includes(track.instanceId));

  async function remove() {
    const groups = new Map<string, string[]>();
    for (const track of selected) {
      if (!track.playlistId) continue;
      const list = groups.get(track.playlistId) ?? [];
      list.push(track.instanceId);
      groups.set(track.playlistId, list);
    }
    await api("/api/duplicates", {
      method: "POST",
      body: JSON.stringify({
        action: "remove",
        confirm: true,
        removals: [...groups.entries()].map(([playlistId, instanceIds]) => ({ playlistId, instanceIds })),
      }),
    });
    setConfirm(false);
    workspace.setInstances([]);
    setMessage("");
    await workspace.refresh();
  }

  return (
    <div className="fixed bottom-5 left-1/2 z-40 w-[min(640px,calc(100%-2rem))] -translate-x-1/2">
      <GlassSurface chrome className="rounded-[28px]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-[15px] font-medium tabular">{count} selected</div>
            <div className="text-[12px] text-[var(--muted)]">Batch actions stay in the working set.</div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => workspace.setInstances([])}>Clear</button>
            {count === 1 ? (
              <button className="btn" onClick={() => workspace.setActiveTrack(selected[0])}>Details</button>
            ) : null}
            <button className="btn btn-danger" onClick={() => setConfirm(true)}>Remove</button>
          </div>
        </div>
        {confirm ? (
          <div className="border-t border-[var(--hairline)] px-4 py-3 text-[14px]">
            <p>Remove {count} track{count === 1 ? "" : "s"} from their playlists? A snapshot is saved first.</p>
            {message ? <p className="mt-1 text-[var(--bad)]">{message}</p> : null}
            <div className="mt-3 flex gap-2">
              <button
                className="btn btn-danger"
                onClick={() => {
                  remove().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Remove failed."));
                }}
              >
                Confirm delete
              </button>
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
      </GlassSurface>
    </div>
  );
}

function TrackSheet() {
  const workspace = useWorkspace();
  const track = workspace.activeTrack;
  if (!track) return null;
  const siblings = workspace.tracks.filter((item) => item.isrc && item.isrc === track.isrc);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25 backdrop-blur-[2px]" onClick={() => workspace.setActiveTrack(null)}>
      <div className="h-full w-[min(420px,100%)] p-3" onClick={(event) => event.stopPropagation()}>
        <GlassSurface chrome className="h-full overflow-auto">
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <ArtTile seed={track.album || track.name} size={84} />
              <button className="btn" onClick={() => workspace.setActiveTrack(null)}>Close</button>
            </div>
            <div>
              <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.025em]">{track.name}</h2>
              <p className="mt-1 text-[15px] text-[var(--text-dim)]">{track.artists.join(", ")}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <Info label="Album" value={track.album || "—"} />
              <Info label="Duration" value={formatDuration(track.durationMs)} />
              <Info label="ISRC" value={track.isrc || "Missing"} />
              <Info label="Playlist" value={track.playlistName || "—"} />
            </dl>
            <ProviderMark provider={track.provider} />
            <div>
              <h3 className="mb-2 text-[13px] font-medium text-[var(--muted)]">Same ISRC in this workspace</h3>
              <ul className="space-y-2">
                {siblings.map((item) => (
                  <li key={item.instanceId} className="flex items-center justify-between gap-2 text-[14px]">
                    <span className="truncate">{item.playlistName}</span>
                    <span className="text-[12px] text-[var(--muted)]">{providerLabel(item.provider)}</span>
                  </li>
                ))}
                {siblings.length === 0 ? <li className="text-[var(--muted)]">No ISRC twins in the working set.</li> : null}
              </ul>
            </div>
          </div>
        </GlassSurface>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inset rounded-2xl p-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 truncate font-medium tabular">{value}</dd>
    </div>
  );
}
