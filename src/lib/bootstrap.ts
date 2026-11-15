import "server-only";
import { prisma } from "@/lib/db";

let bootstrapped: Promise<void> | null = null;

export function bootstrap() {
  bootstrapped ??= clearRetiredFixtures().catch((error) => {
    bootstrapped = null;
    throw error;
  });
  return bootstrapped;
}

const RETIRED_PLAYLIST_IDS = new Set(["sp-late", "am-late", "yt-late", "sp-focus", "yt-live", "yt-bedroom", "am-sunday", "sp-ocean", "sp-drafts", "am-vocals"]);

async function clearRetiredFixtures() {
  await prisma.syncTask.deleteMany({ where: { id: "task_late_night_demo" } });
  const presets = await prisma.workspacePreset.findMany();
  const stale = presets.filter((preset) => {
    try {
      const ids = JSON.parse(preset.playlistIds) as string[];
      return ids.length > 0 && ids.every((id) => RETIRED_PLAYLIST_IDS.has(id));
    } catch {
      return false;
    }
  });
  if (stale.length) {
    await prisma.workspacePreset.deleteMany({ where: { id: { in: stale.map((preset) => preset.id) } } });
  }
}
