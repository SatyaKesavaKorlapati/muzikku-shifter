import { randomUUID } from "crypto";
import { bootstrap } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSession();
    await bootstrap();
    const presets = await prisma.workspacePreset.findMany({ orderBy: { updatedAt: "desc" } });
    return ok({
      presets: presets.map((preset) => ({
        ...preset,
        playlistIds: JSON.parse(preset.playlistIds) as string[],
      })),
    });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSession();
    const body = (await request.json()) as { name?: string; playlistIds?: string[] };
    if (!body.name?.trim() || !body.playlistIds?.length) return fail("Name and at least one playlist are required.");
    const preset = await prisma.workspacePreset.create({
      data: {
        id: `ws_${randomUUID()}`,
        name: body.name.trim(),
        playlistIds: JSON.stringify(body.playlistIds),
      },
    });
    return ok({ preset: { ...preset, playlistIds: body.playlistIds } });
  } catch (error) {
    return fail(error, 500);
  }
}
