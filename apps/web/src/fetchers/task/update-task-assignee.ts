import { client } from "@kaneo/libs";
import type Task from "@/types/task";

type UpdateTaskAssigneePayload = Pick<Task, "userId"> & {
  alsoWatch?: boolean;
};

async function updateTaskAssignee(
  taskId: string,
  task: UpdateTaskAssigneePayload,
) {
  const response = await client.task.assignee[":id"].$put({
    param: { id: taskId },
    json: {
      userId: task.userId || "",
      alsoWatch: task.alsoWatch,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default updateTaskAssignee;
