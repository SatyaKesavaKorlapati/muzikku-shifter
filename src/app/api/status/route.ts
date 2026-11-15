import { bootstrap } from "@/lib/bootstrap";
import { setupStatus } from "@/lib/config";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSession();
    await bootstrap();
    const connections = await prisma.connection.findMany({ orderBy: { provider: "asc" } });
    const setup = setupStatus();
    return ok({
      ...setup,
      connections: connections.map((connection) => ({
        provider: connection.provider,
        displayName: connection.displayName,
        externalUserId: connection.externalUserId,
        expiresAt: connection.expiresAt,
        updatedAt: connection.updatedAt,
      })),
    });
  } catch (error) {
    return fail(error, 500);
  }
}
