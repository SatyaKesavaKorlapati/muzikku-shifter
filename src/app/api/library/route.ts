import { bootstrap } from "@/lib/bootstrap";
import { fail, ok } from "@/lib/http";
import { getAdapter, listAllPlaylists } from "@/lib/providers/registry";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSession();
    await bootstrap();
    const result = await listAllPlaylists();
    return ok(result);
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSession();
    const body = (await request.json()) as { provider?: string; name?: string; description?: string };
    if (!body.provider || !body.name?.trim()) return fail("Provider and name are required.");
    const adapter = await getAdapter(body.provider);
    const playlist = await adapter.createPlaylist(body.name.trim(), body.description);
    return ok({ playlist });
  } catch (error) {
    return fail(error, 500);
  }
}
