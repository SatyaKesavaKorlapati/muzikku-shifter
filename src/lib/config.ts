import "server-only";

export type ProviderId = "spotify" | "apple" | "youtube";

export const PROVIDERS: ProviderId[] = ["spotify", "apple", "youtube"];

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function encryptionKey(): string | null {
  const key = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!key || key === "change-me-to-a-long-random-string") return key || null;
  return key;
}

export function encryptionReady(): boolean {
  const key = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  return Boolean(key && key.length >= 16 && key !== "change-me-to-a-long-random-string");
}

const PLACEHOLDER_KEY = "change-me-to-a-long-random-string";

export function envIsSet(name: string): boolean {
  const value = process.env[name]?.trim();
  if (!value) return false;
  if (name === "TOKEN_ENCRYPTION_KEY" && (value.length < 16 || value === PLACEHOLDER_KEY)) return false;
  return true;
}

export function applePrivateKeyConfigured(): boolean {
  return envIsSet("APPLE_PRIVATE_KEY") || envIsSet("APPLE_PRIVATE_KEY_PATH");
}

export function missingEnv(names: string[]): string[] {
  return names.filter((name) => (name === "APPLE_PRIVATE_KEY" ? !applePrivateKeyConfigured() : !envIsSet(name)));
}

const SPOTIFY_REQUIRED = ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"];
const YOUTUBE_REQUIRED = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"];
const APPLE_REQUIRED = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "TOKEN_ENCRYPTION_KEY"];
const GLOBAL_KEYS = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "APP_URL",
];

export function setupStatus() {
  const spotifyMissing = missingEnv(SPOTIFY_REQUIRED);
  const youtubeMissing = missingEnv(YOUTUBE_REQUIRED);
  const appleMissing = missingEnv(APPLE_REQUIRED);
  const missing = missingEnv(GLOBAL_KEYS);
  return {
    missing,
    present: [
      ...GLOBAL_KEYS.filter((name) => !missing.includes(name)),
      ...["APPLE_PRIVATE_KEY_PATH", "APPLE_STOREFRONT"].filter((name) => envIsSet(name)),
    ],
    encryptionReady: encryptionReady(),
    appUrl: appUrl(),
    redirects: {
      spotify: spotifyRedirect(),
      youtube: youtubeRedirect(),
    },
    credentials: {
      spotify: spotifyMissing.length === 0,
      apple: appleMissing.length === 0,
      youtube: youtubeMissing.length === 0,
    },
    providers: {
      spotify: { ready: spotifyMissing.length === 0, missing: spotifyMissing },
      youtube: { ready: youtubeMissing.length === 0, missing: youtubeMissing },
      apple: { ready: appleMissing.length === 0, missing: appleMissing },
    },
  };
}

export function credentialStatus() {
  const status = setupStatus();
  return status.credentials;
}

export function spotifyRedirect(): string {
  return `${appUrl()}/api/auth/spotify/callback`;
}

export function youtubeRedirect(): string {
  return `${appUrl()}/api/auth/youtube/callback`;
}
