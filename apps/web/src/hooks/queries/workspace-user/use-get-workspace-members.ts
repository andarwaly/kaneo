import { useQuery } from "@tanstack/react-query";
import getWorkspaceMembers from "@/fetchers/workspace-user/get-workspace-members";

function useGetWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-members", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => getWorkspaceMembers({ workspaceId: workspaceId as string }),
  });
}

export default useGetWorkspaceMembers;
