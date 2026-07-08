import { client } from "@kaneo/libs";

type RemoveTaskWatcherPayload = {
  taskId: string;
  userId: string;
};

async function removeTaskWatcher({ taskId, userId }: RemoveTaskWatcherPayload) {
  const response = await client.task[":id"].watchers[":userId"].$delete({
    param: { id: taskId, userId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default removeTaskWatcher;
