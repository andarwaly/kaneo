import { useQuery } from "@tanstack/react-query";
import getTaskWatchers from "@/fetchers/task/get-task-watchers";

export function useTaskWatchers(taskId: string) {
  return useQuery({
    queryKey: ["task-watchers", taskId],
    queryFn: () => getTaskWatchers(taskId),
    enabled: !!taskId,
  });
}
