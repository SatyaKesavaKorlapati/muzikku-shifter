import { fail, ok } from "@/lib/http";
import { credentialStatus } from "@/lib/config";
import { saveTokens } from "@/lib/providers/auth";
import { providerFetch, readJson } from "@/lib/providers/http";
import { createAppleDeveloperToken } from "@/lib/providers/apple";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureSession();
    if (!credentialStatus().apple) {
      return fail("Apple Music credentials are not configured. Add APPLE_TEAM_ID, APPLE_KEY_ID, and a private key.");
    }
    const body = (await request.json()) as { userToken?: string };
    if (!body.userToken?.trim()) return fail("MusicKit user token is required.");
    const developer = await createAppleDeveloperToken();
    const response = await providerFetch("https://api.music.apple.com/v1/me/storefront", {
      headers: { Authorization: `Bearer ${developer}`, "Music-User-Token": body.userToken.trim() },
    });
    const profile = await readJson<{ data?: { id?: string; attributes?: { name?: string } }[] }>(response);
    const store = profile.data?.[0];
    await saveTokens(
      "apple",
      { accessToken: body.userToken.trim() },
      { displayName: store?.attributes?.name ? `Apple Music · ${store.attributes.name}` : "Apple Music", externalUserId: store?.id, metaJson: JSON.stringify({ storefront: store?.id }) },
    );
    return ok({ connected: true, displayName: store?.attributes?.name || "Apple Music" });
  } catch (error) {
    return fail(error, 400);
  }
}
