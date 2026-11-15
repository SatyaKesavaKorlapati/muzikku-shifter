"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/glass/PageHeader";
import { TrackDataGrid, type GridTrack } from "@/components/glass/TrackDataGrid";
import { useWorkspace } from "@/components/shell/Workspace";
import { api } from "@/lib/client-api";

export default function SearchPage() {
  const workspace = useWorkspace();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GridTrack[]>([]);
  const [playlists, setPlaylists] = useState<{ id: string; name: string; provider: string }[]>([]);
  const [error, setError] = useState("");
  const ids = workspace.selectedIds.join(",");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!ids || !query) {
      setHits([]);
      setPlaylists([]);
      return;
    }
    let cancel = false;
    api<{ tracks: GridTrack[]; playlists: { id: string; name: string; provider: string }[] }>(
      `/api/search?q=${encodeURIComponent(query)}&ids=${ids}`,
    )
      .then((result) => {
        if (cancel) return;
        setHits(result.tracks);
        setPlaylists(result.playlists);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Search failed.");
      });
    return () => {
      cancel = true;
    };
  }, [ids, query]);

  return (
    <div>
      <PageHeader
        kicker="Find"
        title="Deep Search"
        subtitle="Matches track name, artist, album, ISRC, and playlist name inside the current workspace."
      />
      {workspace.playlists.length === 0 ? (
        <p className="mb-4 text-[15px] text-[var(--text-dim)]">Connect an account first. Search only looks through playlists on connected services.</p>
      ) : null}
      <input
        className="field mb-4 text-[18px]"
        placeholder="Title, artist, album, or ISRC"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        aria-label="Deep search"
      />
      {error ? <p className="mb-3 text-[var(--bad)]">{error}</p> : null}
      {playlists.length ? <p className="mb-3 text-[14px] text-[var(--text-dim)]">Playlists: {playlists.map((playlist) => playlist.name).join(", ")}</p> : null}
      <TrackDataGrid
        tracks={hits}
        selected={workspace.selectedInstances}
        onToggle={workspace.toggleInstance}
        onToggleAll={(next, on) => workspace.setInstances(on ? next : [])}
        onOpen={workspace.setActiveTrack}
      />
    </div>
  );
}
