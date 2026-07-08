import { useMutation, useQueryClient } from "@tanstack/react-query";
import removeTaskWatcher from "@/fetchers/task/remove-task-watcher";

export function useRemoveTaskWatcher(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => removeTaskWatcher({ taskId, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-watchers", taskId] });
    },
  });
}
