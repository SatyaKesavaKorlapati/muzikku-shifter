import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    await ensureSession();
    const { provider } = await context.params;
    await prisma.connection.delete({ where: { provider } }).catch(() => null);
    return ok({ disconnected: provider });
  } catch (error) {
    return fail(error, 500);
  }
}
