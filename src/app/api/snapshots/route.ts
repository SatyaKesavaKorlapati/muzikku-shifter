import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ensureSession } from "@/lib/session";
import { restoreSnapshot } from "@/lib/sync/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSession();
    const snapshots = await prisma.snapshot.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return ok({
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        label: snapshot.label,
        provider: snapshot.provider,
        playlistId: snapshot.playlistId,
        taskId: snapshot.taskId,
        createdAt: snapshot.createdAt,
      })),
    });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSession();
    const body = (await request.json()) as { id?: string };
    if (!body.id) return fail("Snapshot id is required.");
    const result = await restoreSnapshot(body.id);
    return ok(result);
  } catch (error) {
    return fail(error, 500);
  }
}
