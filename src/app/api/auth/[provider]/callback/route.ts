import { NextResponse } from "next/server";
import { appUrl } from "@/lib/config";
import { fail } from "@/lib/http";
import { clearOauth, connectionErrorRedirect, finishSpotify, finishYouTube, readOauth } from "@/lib/oauth";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    await ensureSession();
    const { provider } = await context.params;
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    if (error) return connectionErrorRedirect(error);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const saved = await readOauth();
    if (!code || !state || state !== saved.state || saved.provider !== provider || !saved.verifier) {
      return connectionErrorRedirect("OAuth state did not match. Start the connection again.");
    }
    if (provider === "spotify") await finishSpotify(code, saved.verifier);
    else if (provider === "youtube") await finishYouTube(code, saved.verifier);
    else return fail("Unknown provider.", 404);
    const response = NextResponse.redirect(`${appUrl()}/connections?connected=${provider}`);
    return clearOauth(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token exchange failed.";
    return connectionErrorRedirect(message);
  }
}
