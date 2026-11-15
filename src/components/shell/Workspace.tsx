"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/client-api";
import type { GridTrack } from "@/components/glass/TrackDataGrid";

export interface PlaylistCard {
  id: string;
  provider: string;
  name: string;
  description?: string;
  trackCount: number;
  owner?: string;
}

export interface Preset {
  id: string;
  name: string;
  playlistIds: string[];
}

export interface ProviderSetup {
  ready: boolean;
  missing: string[];
}

export interface AppStatus {
  credentials: { spotify: boolean; apple: boolean; youtube: boolean };
  providers: { spotify: ProviderSetup; apple: ProviderSetup; youtube: ProviderSetup };
  missing: string[];
  present: string[];
  encryptionReady: boolean;
  appUrl: string;
  redirects: { spotify: string; youtube: string };
  connections: { provider: string; displayName?: string | null; updatedAt: string }[];
}

interface WorkspaceValue {
  status: AppStatus | null;
  warnings: string[];
  playlists: PlaylistCard[];
  presets: Preset[];
  selectedIds: string[];
  togglePlaylist: (id: string) => void;
  applyPreset: (ids: string[]) => void;
  savePreset: (name: string) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  tracks: GridTrack[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  selectedInstances: string[];
  toggleInstance: (id: string) => void;
  setInstances: (ids: string[]) => void;
  activeTrack: GridTrack | null;
  setActiveTrack: (track: GridTrack | null) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const STORAGE = "muzikku.playlists";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistCard[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tracks, setTracks] = useState<GridTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [activeTrack, setActiveTrack] = useState<GridTrack | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    const [nextStatus, library, workspace] = await Promise.all([
      api<AppStatus>("/api/status"),
      api<{ playlists: PlaylistCard[]; warnings: string[] }>("/api/library"),
      api<{ presets: Preset[] }>("/api/workspaces"),
    ]);
    setStatus(nextStatus);
    setPlaylists(library.playlists);
    setWarnings(library.warnings || []);
    setPresets(workspace.presets);
    return library.playlists;
  }, []);

  useEffect(() => {
    let cancel = false;
    refresh()
      .then((loaded) => {
        if (cancel) return;
        const stored = localStorage.getItem(STORAGE);
        const parsed = stored ? (JSON.parse(stored) as string[]) : [];
        const valid = parsed.filter((id) => loaded.some((playlist) => playlist.id === id));
        setSelectedIds(valid.length ? valid : loaded.map((playlist) => playlist.id));
        setReady(true);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancel) return;
        setError(reason instanceof Error ? reason.message : "Could not load the library.");
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE, JSON.stringify(selectedIds));
    let cancel = false;
    setLoading(true);
    const query = selectedIds.length ? `?ids=${selectedIds.join(",")}` : "?ids=";
    api<{ tracks: GridTrack[] }>(`/api/library/tracks${query}`)
      .then((result) => {
        if (!cancel) setTracks(result.tracks);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Could not load tracks.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [ready, selectedIds, tick]);

  const togglePlaylist = useCallback((id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);
  const applyPreset = useCallback((ids: string[]) => setSelectedIds(ids), []);
  const toggleInstance = useCallback((id: string) => {
    setSelectedInstances((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);
  const setInstances = useCallback((ids: string[]) => setSelectedInstances(ids), []);
  const savePreset = useCallback(async (name: string) => {
    const result = await api<{ preset: Preset }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name, playlistIds: selectedIds }),
    });
    setPresets((current) => [result.preset, ...current]);
  }, [selectedIds]);
  const deletePreset = useCallback(async (id: string) => {
    await api(`/api/workspaces/${id}`, { method: "DELETE" });
    setPresets((current) => current.filter((preset) => preset.id !== id));
  }, []);
  const refreshAll = useCallback(async () => {
    await refresh();
    setTick((value) => value + 1);
  }, [refresh]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      status,
      warnings,
      playlists,
      presets,
      selectedIds,
      togglePlaylist,
      applyPreset,
      savePreset,
      deletePreset,
      tracks,
      loading,
      error,
      refresh: refreshAll,
      selectedInstances,
      toggleInstance,
      setInstances,
      activeTrack,
      setActiveTrack,
    }),
    [status, warnings, playlists, presets, selectedIds, togglePlaylist, applyPreset, savePreset, deletePreset, tracks, loading, error, refreshAll, selectedInstances, toggleInstance, setInstances, activeTrack],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace missing");
  return value;
}
