import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const VERSION = "v1";

function keyBytes(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 16 || raw === "change-me-to-a-long-random-string") {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is missing or still the example placeholder. Set a long random string in .env before connecting accounts.",
    );
  }
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    /* derive below */
  }
  return scryptSync(raw, "muzikku-shifter-token-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Stored token could not be read.");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]);
  return plain.toString("utf8");
}
