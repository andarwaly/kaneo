import db from "../../database";
import { taskWatcherTable } from "../../database/schema";

async function addTaskWatcher({
  taskId,
  userId,
}: {
  taskId: string;
  userId: string;
}) {
  await db
    .insert(taskWatcherTable)
    .values({ taskId, userId })
    .onConflictDoNothing();
}

export default addTaskWatcher;
