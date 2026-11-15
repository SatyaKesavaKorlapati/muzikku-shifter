import { fail, ok } from "@/lib/http";
import { createAppleDeveloperToken } from "@/lib/providers/apple";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSession();
    const token = await createAppleDeveloperToken();
    return ok({ token });
  } catch (error) {
    return fail(error, 400);
  }
}
