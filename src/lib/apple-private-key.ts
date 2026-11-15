import "server-only";
import fs from "fs";

export function readApplePrivateKey(): string | null {
  const inline = process.env.APPLE_PRIVATE_KEY?.trim();
  if (inline) return inline.replace(/\\n/g, "\n");
  const path = process.env.APPLE_PRIVATE_KEY_PATH?.trim();
  if (!path) return null;
  try {
    return fs.readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
