import { beginSpotify, beginYouTube } from "@/lib/oauth";
import { fail } from "@/lib/http";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    await ensureSession();
    const { provider } = await context.params;
    if (provider === "spotify") return beginSpotify();
    if (provider === "youtube") return beginYouTube();
    return fail("That provider does not use this OAuth start route.", 404);
  } catch (error) {
    return fail(error, 500);
  }
}
