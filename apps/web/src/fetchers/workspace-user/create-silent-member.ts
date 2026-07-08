import { client } from "@kaneo/libs";

export type CreateSilentMemberRequest = {
  workspaceId: string;
  name: string;
  email?: string;
};

async function createSilentMember({
  workspaceId,
  name,
  email,
}: CreateSilentMemberRequest) {
  const response = await client.workspace[":workspaceId"][
    "silent-members"
  ].$post({
    param: { workspaceId },
    json: { name, email },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default createSilentMember;
