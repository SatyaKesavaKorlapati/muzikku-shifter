export type ProviderId = "spotify" | "apple" | "youtube" | (string & {});

export interface Track {
  id: string;
  provider: ProviderId;
  uri: string;
  name: string;
  artists: string[];
  album: string;
  durationMs: number;
  isrc?: string;
  artworkUrl?: string;
  explicit?: boolean;
  isRemix?: boolean;
  isLive?: boolean;
  instanceId?: string;
  playlistId?: string;
  position?: number;
}

export interface Playlist {
  id: string;
  provider: ProviderId;
  name: string;
  description?: string;
  trackCount: number;
  artworkUrl?: string;
  owner?: string;
}

export interface MetadataQuery {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  isrc?: string;
}

export interface MusicProviderAdapter {
  readonly id: ProviderId;
  readonly displayName: string;
  fetchPlaylists(): Promise<Playlist[]>;
  fetchPlaylistTracks(playlistId: string): Promise<Track[]>;
  searchTrackByISRC(isrc: string): Promise<Track[]>;
  searchTrackByMetadata(query: MetadataQuery): Promise<Track[]>;
  addTracks(
    playlistId: string,
    tracks: Track[],
    position?: "append" | "prepend",
  ): Promise<{ added: number }>;
  removeTracks(playlistId: string, trackIds: string[], instanceIds?: string[]): Promise<{ removed: number }>;
  createPlaylist(name: string, description?: string): Promise<Playlist>;
}

export interface ScoredTrack {
  track: Track;
  score: number;
  tier: "id" | "isrc" | "metadata" | "none";
  reasons: string[];
}
