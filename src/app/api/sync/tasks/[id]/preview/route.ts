import { fail, ok } from "@/lib/http";
import { ensureSession } from "@/lib/session";
import { executeSyncTask } from "@/lib/sync/runner";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureSession();
    const { id } = await context.params;
    const summary = await executeSyncTask(id, { dryRun: true });
    return ok(summary);
  } catch (error) {
    return fail(error, 500);
  }
}
