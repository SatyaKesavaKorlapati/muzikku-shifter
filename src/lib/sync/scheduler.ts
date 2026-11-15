import "server-only";
import { runDueTasks } from "@/lib/sync/runner";

export function startScheduler() {
  if (globalThis.__muzikkuScheduler) return;
  const timer = setInterval(() => {
    void runDueTasks();
  }, 30_000);
  timer.unref?.();
  globalThis.__muzikkuScheduler = timer;
}
