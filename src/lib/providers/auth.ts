import "server-only";
import type { Connection } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { spotifyRedirect, youtubeRedirect } from "@/lib/config";
import { providerFetch, readJson } from "@/lib/providers/http";

export interface LiveTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
}

export async function tokensFromConnection(connection: Connection): Promise<LiveTokens> {
  return {
    accessToken: connection.accessTokenEnc ? decryptSecret(connection.accessTokenEnc) : "",
    refreshToken: connection.refreshTokenEnc ? decryptSecret(connection.refreshTokenEnc) : undefined,
    expiresAt: connection.expiresAt,
  };
}

export async function saveTokens(provider: string, tokens: LiveTokens, extra?: Partial<Connection>) {
  await prisma.connection.upsert({
    where: { provider },
    create: {
      provider,
      displayName: extra?.displayName,
      externalUserId: extra?.externalUserId,
      accessTokenEnc: tokens.accessToken ? encryptSecret(tokens.accessToken) : null,
      refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
      scopes: extra?.scopes,
      metaJson: extra?.metaJson,
    },
    update: {
      displayName: extra?.displayName,
      externalUserId: extra?.externalUserId,
      accessTokenEnc: tokens.accessToken ? encryptSecret(tokens.accessToken) : undefined,
      refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
      expiresAt: tokens.expiresAt,
      scopes: extra?.scopes,
      metaJson: extra?.metaJson,
    },
  });
}

export async function refreshSpotify(connection: Connection): Promise<string> {
  const tokens = await tokensFromConnection(connection);
  if (tokens.expiresAt && tokens.expiresAt.getTime() > Date.now() + 30_000 && tokens.accessToken) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) throw new Error("Spotify refresh token is missing. Reconnect the account.");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: process.env.SPOTIFY_CLIENT_ID || "",
  });
  if (process.env.SPOTIFY_CLIENT_SECRET) body.set("client_secret", process.env.SPOTIFY_CLIENT_SECRET);
  const response = await providerFetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await readJson<{ access_token: string; expires_in: number; refresh_token?: string }>(response);
  const next: LiveTokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || tokens.refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
  await saveTokens("spotify", next);
  return next.accessToken;
}

export async function refreshGoogle(connection: Connection): Promise<string> {
  const tokens = await tokensFromConnection(connection);
  if (tokens.expiresAt && tokens.expiresAt.getTime() > Date.now() + 30_000 && tokens.accessToken) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) throw new Error("Google refresh token is missing. Reconnect YouTube.");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
  });
  const response = await providerFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await readJson<{ access_token: string; expires_in: number }>(response);
  const next: LiveTokens = {
    accessToken: json.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
  await saveTokens("youtube", next);
  return next.accessToken;
}

export function oauthRedirectFor(provider: "spotify" | "youtube"): string {
  return provider === "spotify" ? spotifyRedirect() : youtubeRedirect();
}
