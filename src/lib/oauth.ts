import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, credentialStatus, spotifyRedirect, youtubeRedirect } from "@/lib/config";
import { saveTokens } from "@/lib/providers/auth";
import { providerFetch, readJson } from "@/lib/providers/http";

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

export async function rememberOauth(provider: string, state: string, verifier: string) {
  const jar = await cookies();
  const common = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" };
  jar.set("mz_oauth_provider", provider, common);
  jar.set("mz_oauth_state", state, common);
  jar.set("mz_pkce", verifier, common);
}

export async function readOauth() {
  const jar = await cookies();
  return {
    provider: jar.get("mz_oauth_provider")?.value,
    state: jar.get("mz_oauth_state")?.value,
    verifier: jar.get("mz_pkce")?.value,
  };
}

export function clearOauth(response: NextResponse) {
  for (const name of ["mz_oauth_provider", "mz_oauth_state", "mz_pkce"]) {
    response.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
  return response;
}

export function connectionErrorRedirect(message: string) {
  return NextResponse.redirect(`${appUrl()}/connections?error=${encodeURIComponent(message)}`);
}

export async function beginSpotify() {
  if (!credentialStatus().spotify) {
    return connectionErrorRedirect("Spotify app credentials are missing. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on Connections, then restart the server if Connect still stays disabled.");
  }
  const { verifier, challenge, state } = createPkce();
  await rememberOauth("spotify", state, verifier);
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.SPOTIFY_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", spotifyRedirect());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set(
    "scope",
    "playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-library-read user-library-modify user-read-private user-read-email",
  );
  return NextResponse.redirect(url);
}

export async function beginYouTube() {
  if (!credentialStatus().youtube) {
    return connectionErrorRedirect("Google/YouTube app credentials are missing. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, enable YouTube Data API v3, and register the redirect URI.");
  }
  const { verifier, challenge, state } = createPkce();
  await rememberOauth("youtube", state, verifier);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", youtubeRedirect());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/youtube");
  return NextResponse.redirect(url);
}

export async function finishSpotify(code: string, verifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyRedirect(),
    client_id: process.env.SPOTIFY_CLIENT_ID || "",
    code_verifier: verifier,
  });
  if (process.env.SPOTIFY_CLIENT_SECRET) body.set("client_secret", process.env.SPOTIFY_CLIENT_SECRET);
  const response = await providerFetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await readJson<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(response);
  const profileRes = await providerFetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = await readJson<{ id: string; display_name?: string; email?: string }>(profileRes);
  await saveTokens(
    "spotify",
    {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    },
    { displayName: profile.display_name || profile.email || profile.id, externalUserId: profile.id, scopes: token.scope },
  );
}

export async function finishYouTube(code: string, verifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: youtubeRedirect(),
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    code_verifier: verifier,
  });
  const response = await providerFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await readJson<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(response);
  const profileRes = await providerFetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = await readJson<{ items?: { id: string; snippet?: { title?: string } }[] }>(profileRes);
  const channel = profile.items?.[0];
  await saveTokens(
    "youtube",
    {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    },
    { displayName: channel?.snippet?.title || "YouTube", externalUserId: channel?.id, scopes: token.scope },
  );
}
