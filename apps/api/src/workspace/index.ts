import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createSilentMemberCtrl from "./controllers/create-silent-member";
import getWorkspaceMembersCtrl from "./controllers/get-workspace-members";

const workspace = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/:workspaceId/members",
    describeRoute({
      operationId: "getWorkspaceMembers",
      tags: ["Workspaces"],
      description: "Get all members of a workspace",
      responses: {
        200: {
          description: "List of workspace members",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    name: v.string(),
                    email: v.string(),
                    image: v.nullable(v.string()),
                    role: v.string(),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromParam("workspaceId"),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const members = await getWorkspaceMembersCtrl(workspaceId);
      return c.json(members);
    },
  )
  .post(
    "/:workspaceId/silent-members",
    describeRoute({
      operationId: "createSilentMember",
      tags: ["Workspaces"],
      description:
        "Create a silent workspace member (assignable, no invite email sent, no login access)",
      responses: {
        200: {
          description: "Created silent member",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  id: v.string(),
                  name: v.string(),
                  email: v.string(),
                  image: v.nullable(v.string()),
                  role: v.string(),
                  isSilent: v.boolean(),
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.minLength(1)),
        email: v.optional(v.pipe(v.string(), v.email())),
      }),
    ),
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { name, email } = c.req.valid("json");
      const member = await createSilentMemberCtrl({ workspaceId, name, email });
      return c.json(member);
    },
  );

export default workspace;
