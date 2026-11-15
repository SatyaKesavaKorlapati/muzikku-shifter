import "server-only";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE = "mz_session";
const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;

export async function ensureSession(): Promise<{ id: string }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) {
    const row = await prisma.session.findUnique({ where: { id: existing } });
    if (row && row.expiresAt.getTime() > Date.now()) return { id: row.id };
  }
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS);
  await prisma.session.create({ data: { id, expiresAt } });
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
  return { id };
}
