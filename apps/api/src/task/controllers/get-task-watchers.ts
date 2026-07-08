import { eq } from "drizzle-orm";
import db from "../../database";
import { taskWatcherTable, userTable } from "../../database/schema";

async function getTaskWatchers(taskId: string) {
  return db
    .select({
      id: userTable.id,
      name: userTable.name,
      image: userTable.image,
      isSilent: userTable.isSilent,
    })
    .from(taskWatcherTable)
    .innerJoin(userTable, eq(taskWatcherTable.userId, userTable.id))
    .where(eq(taskWatcherTable.taskId, taskId));
}

export default getTaskWatchers;
