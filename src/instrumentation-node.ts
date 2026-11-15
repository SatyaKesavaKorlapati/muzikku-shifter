import "server-only";
import { startScheduler } from "@/lib/sync/scheduler";

export function registerNodeScheduler() {
  if (process.env.npm_lifecycle_event === "build") return;
  startScheduler();
}
