import { Check } from "lucide-react";
import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SilentMemberBadge } from "@/components/ui/silent-member-badge";
import { useAddTaskWatcher } from "@/hooks/mutations/task/use-add-task-watcher";
import { useRemoveTaskWatcher } from "@/hooks/mutations/task/use-remove-task-watcher";
import { useTaskWatchers } from "@/hooks/queries/task/use-task-watchers";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";

type TaskWatcherPopoverProps = {
  taskId: string;
  workspaceId: string;
  children: React.ReactNode;
};

export function TaskWatcherPopover({
  taskId,
  workspaceId,
  children,
}: TaskWatcherPopoverProps) {
  const { data: watchers } = useTaskWatchers(taskId);
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const { mutate: addWatcher } = useAddTaskWatcher(taskId);
  const { mutate: removeWatcher } = useRemoveTaskWatcher(taskId);

  const usersOptions = useMemo(() => {
    return workspaceUsers?.members?.map((member) => ({
      value: member.userId,
      image: member?.user?.image ?? "",
      name: member?.user?.name ?? member.userId,
      isSilent: member.isSilent ?? false,
    }));
  }, [workspaceUsers]);

  const watcherIds = useMemo(
    () => new Set((watchers ?? []).map((watcher) => watcher.id)),
    [watchers],
  );

  const handleToggleWatcher = (userId: string, isWatching: boolean) => {
    if (isWatching) {
      removeWatcher(userId);
    } else {
      addWatcher(userId);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="max-h-80 space-y-1 overflow-y-auto p-1">
          {(usersOptions ?? []).map((user) => {
            const isWatching = watcherIds.has(user.value);
            return (
              <Button
                key={user.value}
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 h-8 px-2"
                onClick={() => handleToggleWatcher(user.value, isWatching)}
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
                  <AvatarFallback className="text-xs font-medium border border-border/30">
                    {user.name?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm truncate">{user.name}</span>
                {user.isSilent && <SilentMemberBadge />}
                {isWatching && <Check className="ml-auto h-4 w-4 shrink-0" />}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
