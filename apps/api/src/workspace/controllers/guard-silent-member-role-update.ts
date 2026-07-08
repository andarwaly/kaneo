import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import db from "../../database";
import { userTable } from "../../database/schema";

/**
 * Silent members (created via POST /:workspaceId/silent-members) are
 * assignable placeholders with no login access. They must never hold
 * admin/owner roles, since those roles imply the ability to authenticate
 * and manage the workspace. This guard is invoked from the
 * `beforeUpdateMemberRole` organization hook in `apps/api/src/auth.ts`,
 * which fires for every `/organization/update-member-role` request —
 * the only code path that changes a workspace member's role.
 */
async function guardSilentMemberRoleUpdate({
  userId,
  role,
}: {
  userId: string;
  role: string | string[];
}) {
  const roles = Array.isArray(role) ? role : [role];
  const isElevating = roles.includes("admin") || roles.includes("owner");
  if (!isElevating) {
    return;
  }

  const targetUser = await db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
  });

  if (targetUser?.isSilent) {
    throw new APIError("BAD_REQUEST", {
      message: "Silent members cannot be granted admin or owner roles",
    });
  }
}

export default guardSilentMemberRoleUpdate;
