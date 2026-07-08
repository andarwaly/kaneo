import { client } from "@kaneo/libs";

type AddTaskWatcherPayload = {
  taskId: string;
  userId: string;
};

async function addTaskWatcher({ taskId, userId }: AddTaskWatcherPayload) {
  const response = await client.task[":id"].watchers.$post({
    param: { id: taskId },
    json: { userId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default addTaskWatcher;
