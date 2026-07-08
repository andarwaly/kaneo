import { useMutation, useQueryClient } from "@tanstack/react-query";
import createSilentMember from "@/fetchers/workspace-user/create-silent-member";

type CreateSilentMemberInput = {
  name: string;
  email?: string;
};

function useCreateSilentMember(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSilentMemberInput) =>
      createSilentMember({ workspaceId, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-members", workspaceId],
      });
    },
  });
}

export default useCreateSilentMember;
