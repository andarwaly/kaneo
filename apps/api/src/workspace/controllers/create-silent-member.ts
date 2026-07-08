import { createId } from "@paralleldrive/cuid2";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { userTable, workspaceUserTable } from "../../database/schema";

async function createSilentMember({
  workspaceId,
  name,
  email,
}: {
  workspaceId: string;
  name: string;
  email?: string;
}) {
  const id = createId();
  const resolvedEmail = email ?? `silent+${id}@noreply.local`;

  const [user] = await db
    .insert(userTable)
    .values({
      id,
      name,
      email: resolvedEmail,
      emailVerified: false,
      isSilent: true,
    })
    .returning();

  if (!user) {
    throw new HTTPException(500, {
      message: "Failed to create silent member",
    });
  }

  const [member] = await db
    .insert(workspaceUserTable)
    .values({
      workspaceId,
      userId: id,
      role: "member",
      joinedAt: new Date(),
    })
    .returning();

  if (!member) {
    throw new HTTPException(500, {
      message: "Failed to add silent member to workspace",
    });
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: member.role,
    isSilent: user.isSilent,
  };
}

export default createSilentMember;
