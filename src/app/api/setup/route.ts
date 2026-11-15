import { setupStatus } from "@/lib/config";
import { ENV_WRITABLE_KEYS, writeEnvValues, type EnvWritableKey } from "@/lib/env-file";
import { fail, ok } from "@/lib/http";
import { ensureSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSession();
    return ok(setupStatus());
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSession();
    const body = (await request.json()) as Partial<Record<EnvWritableKey, unknown>>;
    const updates: Record<string, string> = {};
    for (const key of ENV_WRITABLE_KEYS) {
      const value = body[key];
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed || trimmed === "••••••••") continue;
      if (key !== "APPLE_PRIVATE_KEY" && /[\r\n]/.test(trimmed)) {
        return fail(`${key} must be a single line.`);
      }
      if (key === "APP_URL" && !/^https?:\/\/.+/i.test(trimmed)) {
        return fail("APP_URL must start with http:// or https://");
      }
      if (key === "TOKEN_ENCRYPTION_KEY" && (trimmed.length < 16 || trimmed === "change-me-to-a-long-random-string")) {
        return fail("TOKEN_ENCRYPTION_KEY must be a random string of at least 16 characters.");
      }
      updates[key] = key === "APPLE_PRIVATE_KEY" ? trimmed.replace(/\\n/g, "\n") : trimmed;
    }
    if (Object.keys(updates).length === 0) return fail("Enter at least one value to save.");
    const saved = await writeEnvValues(updates);
    return ok({
      saved,
      restart: true,
      ...setupStatus(),
    });
  } catch (error) {
    return fail(error, 500);
  }
}
