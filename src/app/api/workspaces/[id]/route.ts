import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureSession();
    const { id } = await context.params;
    await prisma.workspacePreset.delete({ where: { id } });
    return ok({ deleted: id });
  } catch (error) {
    return fail(error, 500);
  }
}
