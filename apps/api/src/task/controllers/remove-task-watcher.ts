import { and, eq } from "drizzle-orm";
import db from "../../database";
import { taskWatcherTable } from "../../database/schema";

async function removeTaskWatcher({
  taskId,
  userId,
}: {
  taskId: string;
  userId: string;
}) {
  await db
    .delete(taskWatcherTable)
    .where(
      and(
        eq(taskWatcherTable.taskId, taskId),
        eq(taskWatcherTable.userId, userId),
      ),
    );
}

export default removeTaskWatcher;
