"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/glass/PageHeader";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { useWorkspace } from "@/components/shell/Workspace";
import { api } from "@/lib/client-api";
import { providerLabel } from "@/lib/utils";

interface ArtistRow {
  name: string;
  trackCount: number;
  playlistCount: number;
  services: string[];
}

export default function ArtistsPage() {
  const workspace = useWorkspace();
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [error, setError] = useState("");
  const max = artists[0]?.trackCount || 1;
  const key = workspace.selectedIds.join(",");

  useEffect(() => {
    if (!key) {
      setArtists([]);
      return;
    }
    api<{ artists: ArtistRow[] }>(`/api/artists?ids=${key}`)
      .then((result) => setArtists(result.artists))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load artists."));
  }, [key]);

  return (
    <div>
      <PageHeader
        kicker="Catalog"
        title="Artists"
        subtitle="How the working set spreads across people. Counts are unique recordings, not repeated playlist rows."
      />
      {error ? <p className="mb-3 text-[var(--bad)]">{error}</p> : null}
      {workspace.playlists.length === 0 ? <p className="mb-3 text-[15px] text-[var(--text-dim)]">Connect an account first. Artist counts come from the playlists you authorize.</p> : null}
      <GlassSurface>
        <ul className="divide-y divide-[var(--hairline)]">
          {artists.map((artist) => (
            <li key={artist.name} className="grid grid-cols-[minmax(0,1fr)_160px_88px] items-center gap-4 px-4 py-3">
              <div>
                <div className="font-medium">{artist.name}</div>
                <div className="text-[12px] text-[var(--muted)]">{artist.services.map(providerLabel).join(" · ")} · {artist.playlistCount} playlists</div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full" style={{ width: `${(artist.trackCount / max) * 100}%`, background: "linear-gradient(90deg, var(--blob-1), var(--blob-2))" }} />
              </div>
              <div className="tabular text-right text-[15px] font-medium">{artist.trackCount}</div>
            </li>
          ))}
        </ul>
      </GlassSurface>
    </div>
  );
}
