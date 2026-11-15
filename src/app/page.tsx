"use client";

import { useState } from "react";
import { PageHeader } from "@/components/glass/PageHeader";
import { ArtTile, ProviderMark } from "@/components/glass/ArtTile";
import { TrackDataGrid } from "@/components/glass/TrackDataGrid";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { useWorkspace } from "@/components/shell/Workspace";
import { cn, providerLabel } from "@/lib/utils";

export default function PlaylistsPage() {
  const workspace = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [name, setName] = useState("");
  const visible = workspace.playlists.filter((playlist) => filter === "all" || playlist.provider === filter);
  const selected = new Set(workspace.selectedIds);

  return (
    <div>
      <PageHeader
        kicker="Workspace"
        title="Playlists"
        subtitle="Select the working set. Search, artists, duplicates, and sync all read from these playlists."
      />
      {workspace.error ? <p className="mb-4 text-[14px] text-[var(--bad)]">{workspace.error}</p> : null}
      {workspace.warnings.length ? <p className="mb-4 text-[14px] text-[var(--warn)]">{workspace.warnings.join(" ")}</p> : null}
      <GlassSurface chrome className="mb-4">
        <div className="flex flex-wrap items-center gap-2 p-3">
          {workspace.presets.map((preset) => (
            <button key={preset.id} className="chip" onClick={() => workspace.applyPreset(preset.playlistIds)}>
              {preset.name}
              <span
                className="ml-2 text-[var(--muted)]"
                onClick={(event) => {
                  event.stopPropagation();
                  void workspace.deletePreset(preset.id);
                }}
              >
                ×
              </span>
            </button>
          ))}
          <form
            className="ml-auto flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              void workspace.savePreset(name.trim()).then(() => setName(""));
            }}
          >
            <input className="field w-48" placeholder="Preset name" value={name} onChange={(event) => setName(event.target.value)} />
            <button className="btn" type="submit">Save set</button>
          </form>
        </div>
      </GlassSurface>
      <div className="mb-4 flex gap-2">
        {["all", "spotify", "apple", "youtube"].map((provider) => (
          <button key={provider} className="chip" data-on={filter === provider} onClick={() => setFilter(provider)}>
            {provider === "all" ? "All services" : providerLabel(provider)}
          </button>
        ))}
        <span className="ml-auto self-center text-[13px] text-[var(--muted)] tabular">{workspace.selectedIds.length} in workspace</span>
      </div>
      {workspace.playlists.length === 0 && !workspace.loading ? (
        <GlassSurface className="mb-8">
          <div className="p-6">
            <h2 className="text-[20px] font-semibold">Connect an account first</h2>
            <p className="mt-2 max-w-xl text-[15px] text-[var(--text-dim)]">
              Playlists, search, duplicates, and sync read only the accounts you authorize. Add your app credentials, then connect Spotify, Apple Music, or YouTube.
            </p>
            <a className="btn btn-primary mt-4 inline-flex" href="/connections">Open Connections</a>
          </div>
        </GlassSurface>
      ) : null}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((playlist) => {
          const on = selected.has(playlist.id);
          return (
            <button
              key={playlist.id}
              onClick={() => workspace.togglePlaylist(playlist.id)}
              className={cn("panel rounded-[28px] p-4 text-left", on && "ring-2 ring-[var(--accent)]")}
            >
              <div className="flex items-start gap-3">
                <ArtTile seed={playlist.name} size={64} />
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-semibold tracking-[-0.02em]">{playlist.name}</div>
                  <ProviderMark provider={playlist.provider} />
                  <div className="mt-1 text-[13px] text-[var(--muted)] tabular">{playlist.trackCount} tracks</div>
                </div>
              </div>
              {playlist.description ? <p className="mt-3 line-clamp-2 text-[13px] leading-snug text-[var(--text-dim)]">{playlist.description}</p> : null}
            </button>
          );
        })}
      </div>
      <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.025em]">Tracks in the working set</h2>
      <TrackDataGrid
        tracks={workspace.tracks}
        selected={workspace.selectedInstances}
        onToggle={workspace.toggleInstance}
        onToggleAll={(ids, on) => workspace.setInstances(on ? ids : [])}
        onOpen={workspace.setActiveTrack}
      />
    </div>
  );
}
