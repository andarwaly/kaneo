import { client } from "@kaneo/libs";

async function getTaskWatchers(taskId: string) {
  const response = await client.task[":id"].watchers.$get({
    param: { id: taskId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default getTaskWatchers;
