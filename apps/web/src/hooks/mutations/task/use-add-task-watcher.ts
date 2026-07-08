import { useMutation, useQueryClient } from "@tanstack/react-query";
import addTaskWatcher from "@/fetchers/task/add-task-watcher";

export function useAddTaskWatcher(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => addTaskWatcher({ taskId, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-watchers", taskId] });
    },
  });
}
