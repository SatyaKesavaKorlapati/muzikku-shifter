import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { __muzikkuPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__muzikkuPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__muzikkuPrisma = prisma;
}
