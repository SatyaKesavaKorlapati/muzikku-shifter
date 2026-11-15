import { randomUUID } from "crypto";
import { bootstrap } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { defaultRules, type SyncRules } from "@/lib/sync/plan";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSession();
    await bootstrap();
    const tasks = await prisma.syncTask.findMany({
      orderBy: { createdAt: "desc" },
      include: { runs: { orderBy: { startedAt: "desc" }, take: 8 } },
    });
    return ok({
      tasks: tasks.map((task) => ({
        ...task,
        rules: JSON.parse(task.rulesJson) as SyncRules,
      })),
    });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSession();
    const body = (await request.json()) as {
      name?: string;
      sourceProvider?: string;
      sourcePlaylistId?: string;
      destProvider?: string;
      destPlaylistId?: string;
      mode?: string;
      rules?: Partial<SyncRules>;
      intervalMinutes?: number | null;
    };
    if (!body.name || !body.sourceProvider || !body.sourcePlaylistId || !body.destProvider || !body.destPlaylistId || !body.mode) {
      return fail("Name, source, destination, and mode are required.");
    }
    const task = await prisma.syncTask.create({
      data: {
        id: `task_${randomUUID()}`,
        name: body.name,
        sourceProvider: body.sourceProvider,
        sourcePlaylistId: body.sourcePlaylistId,
        destProvider: body.destProvider,
        destPlaylistId: body.destPlaylistId,
        mode: body.mode,
        rulesJson: JSON.stringify({ ...defaultRules(), ...body.rules }),
        intervalMinutes: body.intervalMinutes || null,
      },
    });
    return ok({ task: { ...task, rules: JSON.parse(task.rulesJson) } });
  } catch (error) {
    return fail(error, 500);
  }
}
