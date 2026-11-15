const FEAT_PAREN = /\s*[([{\[]\s*(?:feat|ft|featuring)\.?\s+[^)\]}]*[)\]}]/gi;
const NOISE_PAREN =
  /\s*[([{\[][^)\]}]*(?:remaster(?:ed)?|official(?:\s+(?:video|audio|music\s+video|lyric\s+video))?|lyric\s+video|visuali[sz]er|audio\s+only|hd|hq|4k|mono|stereo|deluxe(?:\s+edition)?|bonus\s+track|album\s+version|single\s+version|radio\s+edit|\bedit\b|explicit|clean)[^)\]}]*[)\]}]/gi;
const FEAT_INLINE = /\s+(?:feat|ft|featuring)\.?\s+.+$/i;

export interface NormalizedTitle {
  normalized: string;
  isRemix: boolean;
  isLive: boolean;
  isRemaster: boolean;
}

export function normalizeTitle(title: string): NormalizedTitle {
  const raw = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const isRemix = /\b(remix|rmx)\b/i.test(raw);
  const isLive = /\blive\b/i.test(raw);
  const isRemaster = /remaster/i.test(raw);
  const stripped = raw
    .replace(FEAT_PAREN, " ")
    .replace(NOISE_PAREN, " ")
    .replace(FEAT_INLINE, " ");
  return {
    normalized: squash(stripped),
    isRemix,
    isLive,
    isRemaster,
  };
}

export function normalizeName(value: string): string {
  const noFeat = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(FEAT_INLINE, "")
    .split(/\s+(?:feat|ft|featuring)\.?\s+/i)[0];
  return squash(noFeat);
}

export function primaryArtist(artists: string[]): string {
  const first = artists.find((artist) => artist.trim().length > 0) ?? "";
  return normalizeName(first.split(/,|&| x /i)[0] ?? first);
}

export function normalizeIsrc(isrc?: string | null): string {
  if (!isrc) return "";
  return isrc.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function squash(value: string): string {
  return value
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
