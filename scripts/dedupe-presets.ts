import { PrismaClient } from "@prisma/client";

async function main() {
const prisma = new PrismaClient();
const rows = await prisma.workspacePreset.findMany({ orderBy: { createdAt: "asc" } });
const seen = new Set<string>();
let removed = 0;
for (const row of rows) {
  if (seen.has(row.name)) {
    await prisma.workspacePreset.delete({ where: { id: row.id } });
    removed += 1;
  } else {
    seen.add(row.name);
  }
}
const tasks = await prisma.syncTask.findMany();
await prisma.syncRun.deleteMany();
await prisma.reviewItem.deleteMany();
await prisma.snapshot.deleteMany();
await prisma.syncTask.updateMany({ data: { status: "idle", paused: false, lastRunAt: null, progressJson: null } });
console.log(`kept ${seen.size} removed ${removed} tasks ${tasks.map((task) => task.id).join(",")}`);
await prisma.$disconnect();
}
main();
