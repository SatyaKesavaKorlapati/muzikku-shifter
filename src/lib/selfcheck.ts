import { findDuplicates } from "@/lib/duplicates/findDuplicates";
import { normalizeTitle } from "@/lib/matching/normalize";
import { createMemoryLibrary, materialize, type Membership, type MemoryState } from "@/lib/providers/memory";
import type { Playlist, ProviderId, Track } from "@/lib/providers/types";
import { buildSyncPlan, type SyncRules } from "@/lib/sync/plan";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}



interface Logical {
  key: string;
  title: string;
  artists: string[];
  album: string;
  durationMs: number;
  isrc?: string;
  isRemix?: boolean;
  isLive?: boolean;
  on: ProviderId[];
  variants?: Partial<Record<ProviderId, Partial<Pick<Track, "name" | "durationMs" | "isrc" | "isRemix" | "isLive">>>>;
}

const LOGICAL: Logical[] = [
  { key: "midnight", title: "Midnight City", artists: ["M83"], album: "Hurry Up, We're Dreaming", durationMs: 243000, isrc: "USM830000001", on: ["spotify", "apple", "youtube"] },
  {
    key: "midnight-yt",
    title: "Midnight City [Official Video]",
    artists: ["M83"],
    album: "Hurry Up, We're Dreaming",
    durationMs: 244200,
    isrc: "USM830000001",
    on: ["youtube"],
  },
  {
    key: "midnight-remaster",
    title: "Midnight City (Remastered 2019)",
    artists: ["M83"],
    album: "Hurry Up, We're Dreaming (Remastered)",
    durationMs: 244200,
    isrc: "USM830000001",
    on: ["spotify", "apple"],
  },
  { key: "blinding", title: "Blinding Lights", artists: ["The Weeknd"], album: "After Hours", durationMs: 200040, isrc: "USUG12000002", on: ["spotify", "apple", "youtube"] },
  {
    key: "blinding-yt",
    title: "Blinding Lights (Official Video)",
    artists: ["The Weeknd"],
    album: "After Hours",
    durationMs: 202000,
    isrc: "USUG12000002",
    on: ["youtube"],
  },
  { key: "blinding-live", title: "Blinding Lights - Live", artists: ["The Weeknd"], album: "Live at SoFi", durationMs: 215400, isrc: "USUG12000017", isLive: true, on: ["spotify", "youtube"] },
  { key: "levitating", title: "Levitating", artists: ["Dua Lipa"], album: "Future Nostalgia", durationMs: 203064, isrc: "GBUV72000003", on: ["spotify", "apple", "youtube"] },
  {
    key: "levitating-remix",
    title: "Levitating (The Blessed Madonna Remix)",
    artists: ["Dua Lipa", "Madonna"],
    album: "Club Future Nostalgia",
    durationMs: 247800,
    isrc: "GBUV72000018",
    isRemix: true,
    on: ["spotify", "youtube"],
  },
  { key: "heat", title: "Heat Waves", artists: ["Glass Animals"], album: "Dreamland", durationMs: 238805, isrc: "GBUM72000004", on: ["spotify", "apple", "youtube"] },
  { key: "pink", title: "Pink + White", artists: ["Frank Ocean"], album: "Blonde", durationMs: 184000, isrc: "USRC11600005", on: ["spotify", "apple", "youtube"] },
  { key: "nights", title: "Nights", artists: ["Frank Ocean"], album: "Blonde", durationMs: 307151, isrc: "USRC11600006", on: ["spotify", "apple"] },
  { key: "redbone", title: "Redbone", artists: ["Childish Gambino"], album: "Awaken, My Love!", durationMs: 326933, isrc: "USUM71600007", on: ["spotify", "apple", "youtube"] },
  { key: "electric", title: "Electric Feel", artists: ["MGMT"], album: "Oracular Spectacular", durationMs: 229000, isrc: "USUM70800008", on: ["spotify", "apple", "youtube"] },
  { key: "sweater", title: "Sweater Weather", artists: ["The Neighbourhood"], album: "I Love You.", durationMs: 240400, isrc: "USUM71300009", on: ["spotify", "apple", "youtube"] },
  {
    key: "sweater-yt",
    title: "Sweater Weather [Official Audio]",
    artists: ["The Neighbourhood"],
    album: "I Love You.",
    durationMs: 241100,
    isrc: "USUM71300009",
    on: ["youtube"],
  },
  { key: "riptide", title: "Riptide", artists: ["Vance Joy"], album: "Dream Your Life Away", durationMs: 204000, isrc: "AUUM71400010", on: ["spotify", "apple", "youtube"] },
  { key: "sunset", title: "Sunset Lover", artists: ["Petit Biscuit"], album: "Presence", durationMs: 237000, isrc: "FRUM71600011", on: ["spotify", "apple", "youtube"] },
  { key: "weightless", title: "Weightless", artists: ["Marconi Union"], album: "Weightless", durationMs: 480000, isrc: "GBUM71200012", on: ["spotify"] },
  {
    key: "weightless-decoy",
    title: "Weightless Study",
    artists: ["Sleep Lab"],
    album: "Focus Noise",
    durationMs: 492000,
    isrc: "USZZZ9900099",
    on: ["apple"],
  },
  { key: "after", title: "After Hours", artists: ["The Weeknd"], album: "After Hours", durationMs: 361000, isrc: "USUG12000013", on: ["spotify", "apple"] },
  { key: "resonance", title: "Resonance", artists: ["Home"], album: "Odyssey", durationMs: 228000, isrc: "USQY51500014", on: ["spotify", "apple", "youtube"] },
  { key: "nightcall", title: "Nightcall", artists: ["Kavinsky"], album: "OutRun", durationMs: 258000, isrc: "FR6V81100015", on: ["spotify", "apple", "youtube"] },
  { key: "intro", title: "Intro", artists: ["The xx"], album: "xx", durationMs: 127000, isrc: "GBUM70900019", on: ["spotify", "apple"] },
  { key: "myth", title: "Myth", artists: ["Beach House"], album: "Bloom", durationMs: 245000, isrc: "USSM11200020", on: ["spotify", "apple", "youtube"] },
  { key: "holocene", title: "Holocene", artists: ["Bon Iver"], album: "Bon Iver", durationMs: 337000, isrc: "USJAG1100021", on: ["spotify", "apple", "youtube"] },
  { key: "pyramids", title: "Pyramids", artists: ["Frank Ocean"], album: "channel ORANGE", durationMs: 594000, isrc: "USRC11200022", on: ["apple", "spotify"] },
  {
    key: "lost",
    title: "Lost in the Fire",
    artists: ["Gesaffelstein", "The Weeknd"],
    album: "Hyperion",
    durationMs: 202000,
    isrc: "FRUM71900023",
    on: ["spotify", "apple", "youtube"],
  },
  { key: "digital", title: "Digital Love", artists: ["Daft Punk"], album: "Discovery", durationMs: 301000, isrc: "GBDUW0100024", on: ["spotify", "apple", "youtube"] },
  { key: "innerbloom", title: "Innerbloom", artists: ["RÜFÜS DU SOL"], album: "Bloom", durationMs: 567000, isrc: "AUUM71600025", on: ["spotify", "apple", "youtube"] },
  { key: "draft", title: "Untitled Demo 04", artists: ["Studio Sketch"], album: "Voice Memos", durationMs: 98000, on: ["spotify"] },
];

interface PlaylistSeed {
  id: string;
  provider: ProviderId;
  name: string;
  description: string;
  owner: string;
  keys: string[];
}

const PLAYLISTS: PlaylistSeed[] = [
  {
    id: "sp-late",
    provider: "spotify",
    name: "Late Night Drive",
    description: "City lights, one repeated Midnight City, a remaster, and a live take.",
    owner: "You",
    keys: ["midnight", "blinding", "levitating", "heat", "pink", "sunset", "weightless", "nightcall", "midnight", "midnight-remaster", "blinding-live", "digital"],
  },
  {
    id: "sp-ocean",
    provider: "spotify",
    name: "Ocean & Neon",
    description: "Frank Ocean, The Weeknd, and a remix that should stay optional.",
    owner: "You",
    keys: ["nights", "redbone", "electric", "after", "pyramids", "lost", "levitating-remix", "pink"],
  },
  {
    id: "sp-focus",
    provider: "spotify",
    name: "Deep Focus",
    description: "Long mixes plus Sunset Lover again, so cross-playlist dupes show up.",
    owner: "You",
    keys: ["resonance", "holocene", "innerbloom", "sweater", "riptide", "intro", "sunset", "myth"],
  },
  {
    id: "sp-drafts",
    provider: "spotify",
    name: "Voice Memos",
    description: "A sketch with no ISRC and no twin on Apple Music.",
    owner: "You",
    keys: ["draft", "intro"],
  },
  {
    id: "am-late",
    provider: "apple",
    name: "Late Night Drive",
    description: "The Apple shelf of the drive. Digital Love is in the catalog, not here yet.",
    owner: "You",
    keys: ["midnight", "blinding", "levitating", "heat", "pink", "sunset", "nightcall"],
  },
  {
    id: "am-sunday",
    provider: "apple",
    name: "Sunday Remasters",
    description: "Remaster of Midnight City plus Discovery.",
    owner: "You",
    keys: ["midnight-remaster", "digital", "after", "myth"],
  },
  {
    id: "am-vocals",
    provider: "apple",
    name: "Vocals in the Room",
    description: "Frank Ocean and company.",
    owner: "You",
    keys: ["pink", "nights", "redbone", "after", "pyramids", "lost"],
  },
  {
    id: "yt-late",
    provider: "youtube",
    name: "Late Night Drive (Official Videos)",
    description: "Titles carry [Official Video] tags. ISRCs still line up.",
    owner: "You",
    keys: ["midnight-yt", "blinding-yt", "levitating", "heat", "nightcall", "sunset"],
  },
  {
    id: "yt-live",
    provider: "youtube",
    name: "Live & Remix Radio",
    description: "A live cut, a remix, and Midnight City filed twice.",
    owner: "You",
    keys: ["blinding-live", "levitating-remix", "midnight-yt", "midnight-yt", "redbone"],
  },
  {
    id: "yt-bedroom",
    provider: "youtube",
    name: "Bedroom Speakers",
    description: "Sweater Weather twice under two titles, plus long songs.",
    owner: "You",
    keys: ["electric", "sweater", "sweater-yt", "riptide", "resonance", "myth", "holocene", "innerbloom"],
  },
];

function trackId(provider: ProviderId, key: string): string {
  return `${provider}:${key}`;
}

function buildFixture(): MemoryState {
  const tracks: Record<string, Track> = {};
  for (const logical of LOGICAL) {
    for (const provider of logical.on) {
      const variant = logical.variants?.[provider];
      const id = trackId(provider, logical.key);
      tracks[id] = {
        id,
        provider,
        uri:
          provider === "spotify"
            ? `spotify:track:${id}`
            : provider === "apple"
              ? `apple-music:song:${id}`
              : `youtube:video:${id}`,
        name: variant?.name ?? logical.title,
        artists: logical.artists,
        album: logical.album,
        durationMs: variant?.durationMs ?? logical.durationMs,
        isrc: variant?.isrc === undefined ? logical.isrc : variant.isrc || undefined,
        isRemix: variant?.isRemix ?? logical.isRemix ?? false,
        isLive: variant?.isLive ?? logical.isLive ?? false,
      };
    }
  }

  const playlists: Playlist[] = [];
  const memberships: Membership[] = [];
  for (const playlist of PLAYLISTS) {
    playlists.push({
      id: playlist.id,
      provider: playlist.provider,
      name: playlist.name,
      description: playlist.description,
      trackCount: playlist.keys.length,
      owner: playlist.owner,
    });
    playlist.keys.forEach((key, index) => {
      const id = trackId(playlist.provider, key);
      memberships.push({
        instanceId: `${playlist.id}:${index}:${id}`,
        playlistId: playlist.id,
        trackId: id,
        position: index,
      });
    });
  }

  return { version: 1, tracks, playlists, memberships };
}

async function main() {
  assert(normalizeTitle("Blinding Lights (Official Video)").normalized === "blinding lights", "official video strip");
  assert(normalizeTitle("Midnight City (Remastered 2019)").normalized === "midnight city", "remaster strip");
  assert(normalizeTitle("Midnight City [Official Video]").normalized === "midnight city", "bracket video strip");
  assert(normalizeTitle("Levitating (feat. DaBaby)").normalized === "levitating", "feat strip");

  const state = buildFixture();
  const library = createMemoryLibrary(state);
  const spotify = library.adapter("spotify");
  const apple = library.adapter("apple");
  const rules: SyncRules = {
    skipDuplicates: true,
    ignoreRemixes: true,
    ignoreLive: true,
    insert: "append",
    removeExtras: false,
  };
  const sourceTracks = materialize(library.getState(), "sp-late");
  const destTracks = materialize(library.getState(), "am-late");
  const plan = await buildSyncPlan({
    mode: "delta",
    rules,
    sourceTracks,
    destinationTracks: destTracks,
    source: spotify,
    destination: apple,
  });
  const names = plan.forward.toAdd.map((track) => track.name);
  assert(names.length === 1 && names[0] === "Digital Love", `expected only Digital Love, got ${names.join(", ") || "nothing"}`);
  assert(
    plan.forward.toReview.some((item) => item.source.name === "Weightless"),
    "Weightless should land in review",
  );
  assert(
    !plan.forward.toAdd.some((track) => /live/i.test(track.name)),
    "live tracks should be ignored",
  );

  const before = materialize(library.getState(), "am-late").length;
  const inserted = await apple.addTracks("am-late", plan.forward.toAdd, "append");
  assert(inserted.added === 1, "add should insert one track");
  const afterTracks = materialize(library.getState(), "am-late");
  assert(afterTracks.length === before + 1, "destination should grow by one");
  assert(afterTracks.some((track) => track.name === "Digital Love"), "Digital Love missing after add");
  assert(!afterTracks.some((track) => track.name === "Weightless"), "unreviewed Weightless must not be copied");

  const playlists = new Map((await Promise.all([spotify.fetchPlaylists(), apple.fetchPlaylists(), library.adapter("youtube").fetchPlaylists()])).flat().map((playlist) => [playlist.id, playlist.name]));
  const tracks = ["sp-late", "sp-focus", "yt-live", "yt-bedroom", "am-late", "am-sunday"].flatMap((playlistId) =>
    materialize(library.getState(), playlistId).map((track) => ({
      ...track,
      playlistId,
      playlistName: playlists.get(playlistId) || playlistId,
      instanceId: track.instanceId || `${playlistId}:${track.id}`,
    })),
  );
  const groups = findDuplicates({ tracks, mode: "both", scope: "both" });
  assert(groups.some((group) => group.kind === "exact" && group.scope === "within"), "missing in-playlist exact duplicate");
  assert(groups.some((group) => group.kind === "exact" && group.scope === "across"), "missing cross-playlist exact duplicate");
  assert(groups.some((group) => group.kind === "fuzzy"), "missing fuzzy duplicate");

  const removed = await spotify.removeTracks(
    "sp-late",
    [],
    sourceTracks.filter((track) => track.id === "spotify:midnight").slice(1).map((track) => track.instanceId || ""),
  );
  assert(removed.removed === 1, "exact duplicate removal should drop one instance");
  const midnightLeft = materialize(library.getState(), "sp-late").filter((track) => track.id === "spotify:midnight");
  assert(midnightLeft.length === 1, "one Midnight City instance should remain");

  console.log("selfcheck ok", {
    add: names,
    review: plan.forward.toReview.map((item) => item.source.name),
    duplicateGroups: groups.length,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
