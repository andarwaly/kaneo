import { client } from "@kaneo/libs";

export type GetWorkspaceMembersRequest = {
  workspaceId: string;
};

async function getWorkspaceMembers({
  workspaceId,
}: GetWorkspaceMembersRequest) {
  const response = await client.workspace[":workspaceId"].members.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default getWorkspaceMembers;
