import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import type { SyncRules } from "@/lib/sync/plan";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureSession();
    const { id } = await context.params;
    const body = (await request.json()) as { paused?: boolean; intervalMinutes?: number | null; name?: string };
    const task = await prisma.syncTask.update({
      where: { id },
      data: {
        paused: body.paused,
        intervalMinutes: body.intervalMinutes,
        name: body.name,
        status: body.paused ? "paused" : undefined,
      },
    });
    return ok({ task: { ...task, rules: JSON.parse(task.rulesJson) as SyncRules } });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureSession();
    const { id } = await context.params;
    await prisma.syncTask.delete({ where: { id } });
    return ok({ deleted: id });
  } catch (error) {
    return fail(error, 500);
  }
}
