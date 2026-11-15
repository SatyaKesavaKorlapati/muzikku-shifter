import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { getAdapter } from "@/lib/providers/registry";
import type { ScoredTrack, Track } from "@/lib/providers/types";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSession();
    const items = await prisma.reviewItem.findMany({ where: { status: "pending" }, orderBy: { createdAt: "desc" } });
    return ok({
      items: items.map((item) => ({
        ...item,
        source: JSON.parse(item.sourceTrackJson) as Track,
        candidates: JSON.parse(item.candidatesJson) as ScoredTrack[],
      })),
    });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSession();
    const body = (await request.json()) as { id?: string; action?: "skip" | "match"; candidateId?: string };
    if (!body.id || !body.action) return fail("Review id and action are required.");
    const item = await prisma.reviewItem.findUnique({ where: { id: body.id } });
    if (!item) return fail("Review item not found.");
    if (body.action === "skip") {
      await prisma.reviewItem.update({ where: { id: item.id }, data: { status: "skipped", resolutionJson: JSON.stringify({ action: "skip" }) } });
      return ok({ status: "skipped" });
    }
    const candidates = JSON.parse(item.candidatesJson) as ScoredTrack[];
    const chosen = candidates.find((candidate) => candidate.track.id === body.candidateId);
    if (!chosen) return fail("Pick one of the suggested candidates.");
    const adapter = await getAdapter(item.destProvider);
    const result = await adapter.addTracks(item.destPlaylistId, [chosen.track], "append");
    await prisma.reviewItem.update({
      where: { id: item.id },
      data: { status: "resolved", resolutionJson: JSON.stringify({ action: "match", trackId: chosen.track.id, added: result.added }) },
    });
    return ok({ status: "resolved", added: result.added });
  } catch (error) {
    return fail(error, 500);
  }
}
