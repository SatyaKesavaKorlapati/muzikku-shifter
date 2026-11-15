export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeScheduler } = await import("./instrumentation-node");
    registerNodeScheduler();
  }
}
