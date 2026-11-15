"use client";

import { memo, useMemo, useRef } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArtTile, ProviderMark } from "@/components/glass/ArtTile";
import { formatDuration } from "@/lib/utils";

export interface GridTrack {
  instanceId: string;
  id: string;
  provider: string;
  name: string;
  artists: string[];
  album: string;
  durationMs: number;
  isrc?: string;
  playlistName?: string;
  playlistId?: string;
  frequency?: number;
  matchedFields?: string[];
}

function TrackDataGridInner({
  tracks,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
}: {
  tracks: GridTrack[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  onOpen: (track: GridTrack) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allOn = tracks.length > 0 && tracks.every((track) => selectedSet.has(track.instanceId));
  const trackIds = useMemo(() => tracks.map((track) => track.instanceId), [tracks]);

  const columns = useMemo<ColumnDef<GridTrack>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <input
            type="checkbox"
            aria-label="Select all tracks"
            checked={allOn}
            onChange={(event) => onToggleAll(trackIds, event.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.name}`}
            checked={selectedSet.has(row.original.instanceId)}
            onChange={() => onToggle(row.original.instanceId)}
            onClick={(event) => event.stopPropagation()}
          />
        ),
        size: 36,
      },
      {
        id: "title",
        header: "Title",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <ArtTile seed={row.original.album || row.original.name} size={40} />
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="truncate text-[13px] text-[var(--muted)]">{row.original.artists.join(", ")}</div>
            </div>
          </div>
        ),
      },
      { accessorKey: "album", header: "Album", cell: ({ getValue }) => <span className="truncate text-[var(--text-dim)]">{String(getValue() || "—")}</span> },
      { id: "service", header: "Service", cell: ({ row }) => <ProviderMark provider={row.original.provider} /> },
      { id: "playlist", header: "Playlist", cell: ({ row }) => <span className="truncate">{row.original.playlistName || "—"}</span> },
      {
        id: "frequency",
        header: "In set",
        cell: ({ row }) => <span className="tabular">{row.original.frequency ?? 1}</span>,
      },
      { id: "isrc", header: "ISRC", cell: ({ row }) => <span className="tabular text-[12px] text-[var(--muted)]">{row.original.isrc || "—"}</span> },
      { id: "duration", header: "Time", cell: ({ row }) => <span className="tabular">{formatDuration(row.original.durationMs)}</span> },
    ],
    [allOn, onToggle, onToggleAll, selectedSet, trackIds],
  );

  const table = useReactTable({ data: tracks, columns, getCoreRowModel: getCoreRowModel() });
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 68,
    overscan: 8,
  });
  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div className="panel overflow-hidden rounded-[28px]">
      <div className="grid grid-cols-[36px_minmax(220px,1.6fr)_minmax(120px,1fr)_120px_minmax(120px,1fr)_70px_140px_64px] gap-2 border-b border-[var(--hairline)] px-4 py-3 text-[12px] font-medium text-[var(--muted)]">
        {table.getHeaderGroups()[0]?.headers.map((header) => (
          <div key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</div>
        ))}
      </div>
      <div ref={parentRef} className="h-[560px] overflow-auto scroll-thin">
        {tracks.length === 0 ? (
          <p className="px-5 py-16 text-[15px] text-[var(--text-dim)]">Nothing in this working set yet. Connect an account and select its playlists.</p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={row.id}
                  onClick={() => onOpen(row.original)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onOpen(row.original);
                  }}
                  role="button"
                  tabIndex={0}
                  className="row-hover absolute left-0 grid w-full grid-cols-[36px_minmax(220px,1.6fr)_minmax(120px,1fr)_120px_minmax(120px,1fr)_70px_140px_64px] items-center gap-2 px-4"
                  style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)`, background: selectedSet.has(row.original.instanceId) ? "var(--row-hover)" : "transparent" }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} className="min-w-0">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export const TrackDataGrid = memo(TrackDataGridInner);
