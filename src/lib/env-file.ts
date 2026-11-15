import "server-only";
import { readFile, writeFile } from "fs/promises";
import path from "path";

export const ENV_WRITABLE_KEYS = [
  "APP_URL",
  "TOKEN_ENCRYPTION_KEY",
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "APPLE_PRIVATE_KEY_PATH",
  "APPLE_STOREFRONT",
] as const;

export type EnvWritableKey = (typeof ENV_WRITABLE_KEYS)[number];

const ALLOWED = new Set<string>(ENV_WRITABLE_KEYS);

function formatEnvValue(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r\n/g, "\n").replace(/\n/g, "\\n");
  if (/[\s#"'\\]/.test(value) || value.includes("\n") || value.includes("\r")) return `"${escaped}"`;
  return value;
}

export function upsertEnvText(text: string, updates: Record<string, string>): string {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${formatEnvValue(updates[match[1]])}`;
  });
  if (next.length && next[next.length - 1] === "") next.pop();
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${formatEnvValue(value)}`);
  }
  return `${next.join(newline)}${newline}`;
}

export async function writeEnvValues(updates: Record<string, string>): Promise<string[]> {
  const keys = Object.keys(updates);
  for (const key of keys) {
    if (!ALLOWED.has(key)) throw new Error(`Refusing to write unknown setting ${key}.`);
  }
  const envPath = path.join(process.cwd(), ".env");
  const examplePath = path.join(process.cwd(), ".env.example");
  let text = "";
  try {
    text = await readFile(envPath, "utf8");
  } catch {
    try {
      text = await readFile(examplePath, "utf8");
    } catch {
      text = "";
    }
  }
  await writeFile(envPath, upsertEnvText(text, updates), "utf8");
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
  return keys;
}
