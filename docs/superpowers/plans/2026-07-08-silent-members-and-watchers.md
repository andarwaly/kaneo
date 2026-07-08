# Silent Members & Task Watchers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fork-only "silent members" (real, assignable workspace members created without sending an invite email) and "task watchers" (a per-task notification subscription list, combined with the "who requested this" concept).

**Architecture:** Silent members are ordinary `userTable` + `workspace_member` rows with an `isSilent` flag — no new auth path, no separate table, full reuse of existing member-sourced UI. Watchers are a new `task_watcher` join table extending the existing event-driven notification pipeline.

**Tech Stack:** Hono, Drizzle ORM, Valibot, hono-openapi, React 19, TanStack Query, Radix UI — all existing project stack, no new dependencies.

## Global Constraints

- Fork-only feature — do not open a PR to `usekaneo/kaneo` upstream.
- Follow existing schema conventions: CUID2 primary keys via `createId()`, cascade FKs, indexed foreign keys, `createdAt`/`updatedAt` timestamps.
- Biome formatting: double quotes, semicolons required, tabs N/A (spaces for TS/TSX).
- Prefer `type` over `interface`.
- All new API inputs validated with Valibot; all routes use `describeRoute`.
- Silent members can never hold `admin`/`owner` workspace roles — enforced server-side, not just hidden in UI.
- Unassigning a task does not remove the assignee from the watcher list.

---

### Task 1: Schema changes — `isSilent` column and `task_watcher` table

**Files:**
- Modify: `apps/api/src/database/schema.ts` (add `isSilent` to `userTable`, add new `taskWatcherTable`)
- Test: `tests/api/database/task-watcher-schema.test.ts` (new)

**Interfaces:**
- Produces: `taskWatcherTable` (columns: `id`, `taskId`, `userId`, `createdAt`), `userTable.isSilent: boolean`

- [ ] **Step 1: Add `isSilent` to `userTable`**

In `apps/api/src/database/schema.ts`, inside the `userTable` definition (currently ends at line 37 with `banExpires`), add:

```typescript
  isSilent: boolean("is_silent").default(false).notNull(),
```

Place it directly after the `banExpires` line, before the closing `});`.

- [ ] **Step 2: Add `taskWatcherTable`**

Add this new table definition immediately after the `taskTable` definition (which ends around line 353 with the `unique("task_project_number_unique")` closing bracket):

```typescript
export const taskWatcherTable = pgTable(
  "task_watcher",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("task_watcher_taskId_idx").on(table.taskId),
    index("task_watcher_userId_idx").on(table.userId),
    unique("task_watcher_task_user_unique").on(table.taskId, table.userId),
  ],
);
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @kaneo/api db:generate`
Expected: a new SQL file appears under `apps/api/drizzle/` adding the `is_silent` column to `user` and creating the `task_watcher` table.

- [ ] **Step 4: Verify the migration applies**

Run: `pnpm --filter @kaneo/api dev` (briefly, then stop with Ctrl+C once startup logs show migrations completed)
Expected: no migration errors in the startup log.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/database/schema.ts apps/api/drizzle/
git commit -m "feat(db): add isSilent flag and task_watcher table"
```

---

### Task 2: Silent member creation — backend

**Files:**
- Create: `apps/api/src/workspace/controllers/create-silent-member.ts`
- Modify: `apps/api/src/workspace/index.ts`
- Test: `tests/api/workspace/create-silent-member.test.ts`

**Interfaces:**
- Consumes: `userTable`, `workspaceUserTable` from `../../database/schema` (Task 1); `workspaceAccessMiddleware`/`workspaceAccess` pattern from `apps/api/src/utils/workspace-access-middleware.ts`
- Produces: `createSilentMember({ workspaceId, name, email? }): Promise<{ id: string; name: string; email: string; image: string | null; role: string; isSilent: boolean }>`

- [ ] **Step 1: Write the failing test**

Create `tests/api/workspace/create-silent-member.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const selectMock = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    insert: (...args: unknown[]) => insertMock(...args),
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

import createSilentMember from "../../../apps/api/src/workspace/controllers/create-silent-member";

describe("createSilentMember", () => {
  beforeEach(() => {
    insertMock.mockReset();
    selectMock.mockReset();
  });

  it("creates a user row with isSilent true and no email sent", async () => {
    const userValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: "user_silent_1",
          name: "Dinda",
          email: "silent+user_silent_1@noreply.local",
          image: null,
          isSilent: true,
        },
      ]),
    });
    const memberValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ role: "member" }]),
    });

    insertMock
      .mockReturnValueOnce({ values: userValues })
      .mockReturnValueOnce({ values: memberValues });

    const result = await createSilentMember({
      workspaceId: "workspace_1",
      name: "Dinda",
    });

    expect(result).toEqual({
      id: "user_silent_1",
      name: "Dinda",
      email: "silent+user_silent_1@noreply.local",
      image: null,
      role: "member",
      isSilent: true,
    });
    expect(memberValues).toHaveBeenCalledWith(
      expect.objectContaining({ role: "member", workspaceId: "workspace_1" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaneo/api test -- create-silent-member`
Expected: FAIL with "Cannot find module '.../create-silent-member'"

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/workspace/controllers/create-silent-member.ts`:

```typescript
import { createId } from "@paralleldrive/cuid2";
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

  const [member] = await db
    .insert(workspaceUserTable)
    .values({
      workspaceId,
      userId: id,
      role: "member",
      joinedAt: new Date(),
    })
    .returning();

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaneo/api test -- create-silent-member`
Expected: PASS

- [ ] **Step 5: Wire the route in `apps/api/src/workspace/index.ts`**

Add the import at the top, alongside the existing `getWorkspaceMembersCtrl` import:

```typescript
import createSilentMemberCtrl from "./controllers/create-silent-member";
```

Chain a new route after the existing `.get("/:workspaceId/members", ...)` handler (replace the final `export default workspace;` with the block below, keeping everything above it unchanged):

```typescript
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
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { name, email } = c.req.valid("json");
      const member = await createSilentMemberCtrl({ workspaceId, name, email });
      return c.json(member);
    },
  );

export default workspace;
```

- [ ] **Step 6: Run the full API test suite**

Run: `pnpm --filter @kaneo/api test`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/workspace/controllers/create-silent-member.ts apps/api/src/workspace/index.ts tests/api/workspace/create-silent-member.test.ts
git commit -m "feat(api): add silent member creation endpoint"
```

---

### Task 3: Role-elevation guard for silent members

**Files:**
- Modify: `apps/api/src/workspace/controllers/get-workspace-members.ts` (add `isSilent` to the selected fields, needed by Task 6 UI)
- Find and modify: the existing workspace role-update controller (search first — see Step 1)
- Test: `tests/api/workspace/update-member-role-guard.test.ts`

**Interfaces:**
- Consumes: `userTable.isSilent` (Task 1)
- Produces: role-update rejection for silent members targeting `admin`/`owner`

- [ ] **Step 1: Locate the existing role-update controller**

Run: `grep -rl "workspace_role\|updateMemberRole\|update-workspace-role" apps/api/src/workspace/`

This will point to the controller that changes a member's role within a workspace (likely `apps/api/src/workspace/controllers/update-member-role.ts` or similar — confirm the exact filename from the grep output before continuing, since the plan cannot assume it without seeing repo state at execution time).

- [ ] **Step 2: Add `isSilent` to `get-workspace-members.ts`**

In `apps/api/src/workspace/controllers/get-workspace-members.ts`, add `isSilent: userTable.isSilent` to the `select({...})` object (alongside `id`, `name`, `email`, `image`, `role`).

- [ ] **Step 3: Write the failing test for the guard**

Create `tests/api/workspace/update-member-role-guard.test.ts` (adjust the import path in Step 1's discovered filename before running):

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMock = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      userTable: {
        findFirst: (...args: unknown[]) => findFirstMock(...args),
      },
    },
  },
}));

// Replace with the actual exported function name found in Step 1.
import updateMemberRole from "../../../apps/api/src/workspace/controllers/update-member-role";

describe("updateMemberRole silent-member guard", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it("rejects promoting a silent member to admin", async () => {
    findFirstMock.mockResolvedValue({ id: "user_1", isSilent: true });

    await expect(
      updateMemberRole({
        workspaceId: "workspace_1",
        userId: "user_1",
        role: "admin",
      }),
    ).rejects.toThrow(/silent/i);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @kaneo/api test -- update-member-role-guard`
Expected: FAIL (guard not yet implemented, or wrong function name — fix the import to match Step 1's actual export before proceeding)

- [ ] **Step 5: Add the guard**

At the top of the role-update controller function body found in Step 1, before the existing update logic, add:

```typescript
const targetUser = await db.query.userTable.findFirst({
  where: eq(userTable.id, userId),
});

if (targetUser?.isSilent && (role === "admin" || role === "owner")) {
  throw new HTTPException(400, {
    message: "Silent members cannot be granted admin or owner roles",
  });
}
```

Add the `eq` and `userTable` imports if not already present in that file.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @kaneo/api test -- update-member-role-guard`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/workspace/controllers/get-workspace-members.ts tests/api/workspace/update-member-role-guard.test.ts
git add apps/api/src/workspace/controllers/*.ts
git commit -m "feat(api): block admin/owner role grants for silent members"
```

---

### Task 4: Task watcher backend — schema queries and endpoints

**Files:**
- Create: `apps/api/src/task/controllers/add-task-watcher.ts`
- Create: `apps/api/src/task/controllers/remove-task-watcher.ts`
- Create: `apps/api/src/task/controllers/get-task-watchers.ts`
- Modify: `apps/api/src/task/index.ts`
- Modify: `apps/api/src/task/controllers/get-task.ts` (bundle `watchers` into task response)
- Modify: `apps/api/src/task/controllers/create-task.ts` (auto-add creator as watcher)
- Test: `tests/api/task/task-watchers.test.ts`

**Interfaces:**
- Consumes: `taskWatcherTable` (Task 1)
- Produces: `addTaskWatcher({ taskId, userId }): Promise<void>`, `removeTaskWatcher({ taskId, userId }): Promise<void>`, `getTaskWatchers(taskId): Promise<Array<{ id: string; name: string; image: string | null; isSilent: boolean }>>`

- [ ] **Step 1: Write failing tests for all three controllers**

Create `tests/api/task/task-watchers.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const deleteMock = vi.fn();
const selectMock = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    insert: (...args: unknown[]) => insertMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

import addTaskWatcher from "../../../apps/api/src/task/controllers/add-task-watcher";
import getTaskWatchers from "../../../apps/api/src/task/controllers/get-task-watchers";
import removeTaskWatcher from "../../../apps/api/src/task/controllers/remove-task-watcher";

describe("task watchers", () => {
  beforeEach(() => {
    insertMock.mockReset();
    deleteMock.mockReset();
    selectMock.mockReset();
  });

  it("addTaskWatcher inserts, ignoring duplicate-watcher conflicts", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    insertMock.mockReturnValue({ values });

    await addTaskWatcher({ taskId: "task_1", userId: "user_1" });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task_1", userId: "user_1" }),
    );
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it("removeTaskWatcher deletes by taskId and userId", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    deleteMock.mockReturnValue({ where });

    await removeTaskWatcher({ taskId: "task_1", userId: "user_1" });

    expect(deleteMock).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
  });

  it("getTaskWatchers returns joined user rows", async () => {
    const where = vi.fn().mockResolvedValue([
      { id: "user_1", name: "Dinda", image: null, isSilent: true },
    ]);
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    selectMock.mockReturnValue({ from });

    const result = await getTaskWatchers("task_1");

    expect(result).toEqual([
      { id: "user_1", name: "Dinda", image: null, isSilent: true },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kaneo/api test -- task-watchers`
Expected: FAIL with "Cannot find module" for all three imports

- [ ] **Step 3: Implement `add-task-watcher.ts`**

```typescript
import db from "../../database";
import { taskWatcherTable } from "../../database/schema";

async function addTaskWatcher({
  taskId,
  userId,
}: {
  taskId: string;
  userId: string;
}) {
  await db
    .insert(taskWatcherTable)
    .values({ taskId, userId })
    .onConflictDoNothing();
}

export default addTaskWatcher;
```

- [ ] **Step 4: Implement `remove-task-watcher.ts`**

```typescript
import { and, eq } from "drizzle-orm";
import db from "../../database";
import { taskWatcherTable } from "../../database/schema";

async function removeTaskWatcher({
  taskId,
  userId,
}: {
  taskId: string;
  userId: string;
}) {
  await db
    .delete(taskWatcherTable)
    .where(
      and(
        eq(taskWatcherTable.taskId, taskId),
        eq(taskWatcherTable.userId, userId),
      ),
    );
}

export default removeTaskWatcher;
```

- [ ] **Step 5: Implement `get-task-watchers.ts`**

```typescript
import { eq } from "drizzle-orm";
import db from "../../database";
import { taskWatcherTable, userTable } from "../../database/schema";

async function getTaskWatchers(taskId: string) {
  return db
    .select({
      id: userTable.id,
      name: userTable.name,
      image: userTable.image,
      isSilent: userTable.isSilent,
    })
    .from(taskWatcherTable)
    .innerJoin(userTable, eq(taskWatcherTable.userId, userTable.id))
    .where(eq(taskWatcherTable.taskId, taskId));
}

export default getTaskWatchers;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @kaneo/api test -- task-watchers`
Expected: PASS

- [ ] **Step 7: Wire watcher routes into `apps/api/src/task/index.ts`**

Add imports near the existing `updateTaskAssignee` import:

```typescript
import addTaskWatcherCtrl from "./controllers/add-task-watcher";
import getTaskWatchersCtrl from "./controllers/get-task-watchers";
import removeTaskWatcherCtrl from "./controllers/remove-task-watcher";
```

Add these route handlers into the existing Hono chain (place after the `/assignee/:id` route block, which ends around line 511-520 per the current file):

```typescript
  .post(
    "/:id/watchers",
    describeRoute({
      operationId: "addTaskWatcher",
      tags: ["Tasks"],
      description: "Add a watcher to a task",
      responses: {
        200: { description: "Watcher added" },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ userId: v.string() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { userId } = c.req.valid("json");
      await addTaskWatcherCtrl({ taskId: id, userId });
      const watchers = await getTaskWatchersCtrl(id);
      return c.json(watchers);
    },
  )
  .delete(
    "/:id/watchers/:userId",
    describeRoute({
      operationId: "removeTaskWatcher",
      tags: ["Tasks"],
      description: "Remove a watcher from a task",
      responses: {
        200: { description: "Watcher removed" },
      },
    }),
    validator("param", v.object({ id: v.string(), userId: v.string() })),
    async (c) => {
      const { id, userId } = c.req.valid("param");
      await removeTaskWatcherCtrl({ taskId: id, userId });
      const watchers = await getTaskWatchersCtrl(id);
      return c.json(watchers);
    },
  )
  .get(
    "/:id/watchers",
    describeRoute({
      operationId: "getTaskWatchers",
      tags: ["Tasks"],
      description: "List watchers for a task",
      responses: {
        200: { description: "List of watchers" },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const watchers = await getTaskWatchersCtrl(id);
      return c.json(watchers);
    },
  );
```

Confirm the file's final `export default task;` (or equivalent) remains after this new chain — do not duplicate the export statement.

- [ ] **Step 8: Bundle watchers into `get-task.ts` response**

In `apps/api/src/task/controllers/get-task.ts`, import the new controller and call it after the existing query, then merge:

```typescript
import getTaskWatchers from "./get-task-watchers";
```

Change the return statement from `return task[0];` to:

```typescript
  const watchers = await getTaskWatchers(taskId);
  return { ...task[0], watchers };
```

- [ ] **Step 9: Auto-add creator as watcher in `create-task.ts`**

In `apps/api/src/task/controllers/create-task.ts`, add the import:

```typescript
import addTaskWatcher from "./add-task-watcher";
```

After the task row is inserted and before the function returns (locate the final `return` statement in the file — the task row variable name is whatever the existing insert assigns, confirm it at implementation time), add:

```typescript
await addTaskWatcher({ taskId: <inserted task id variable>, userId: currentUserId });
```

- [ ] **Step 10: Run the full API test suite**

Run: `pnpm --filter @kaneo/api test`
Expected: all tests PASS

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/task/
git commit -m "feat(api): add task watcher endpoints, auto-watch on creation"
```

---

### Task 5: Assign → auto-watch convenience

**Files:**
- Modify: `apps/api/src/task/controllers/update-task-assignee.ts`
- Modify: `apps/api/src/task/index.ts` (the `/assignee/:id` route)
- Test: `tests/api/task/update-task-assignee-watch.test.ts`

**Interfaces:**
- Consumes: `addTaskWatcher` (Task 4)
- Produces: `updateTaskAssignee({ id, userId, currentUserId, alsoWatch? })` — extends existing signature with one new optional field

- [ ] **Step 1: Write the failing test**

Create `tests/api/task/update-task-assignee-watch.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMock = vi.fn();
const updateMock = vi.fn();
const selectMock = vi.fn();
const addWatcherMock = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: { taskTable: { findFirst: (...args: unknown[]) => findFirstMock(...args) } },
    update: (...args: unknown[]) => updateMock(...args),
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

vi.mock("../../../apps/api/src/events", () => ({
  publishEvent: vi.fn(),
}));

vi.mock("../../../apps/api/src/task/controllers/add-task-watcher", () => ({
  default: (...args: unknown[]) => addWatcherMock(...args),
}));

import updateTaskAssignee from "../../../apps/api/src/task/controllers/update-task-assignee";

describe("updateTaskAssignee alsoWatch", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    updateMock.mockReset();
    selectMock.mockReset();
    addWatcherMock.mockReset();
  });

  it("adds the new assignee as a watcher when alsoWatch is true", async () => {
    findFirstMock.mockResolvedValue({ id: "task_1", userId: null, projectId: "project_1", title: "T" });
    const returning = vi.fn().mockResolvedValue([{ id: "task_1", userId: "user_2", projectId: "project_1", title: "T" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    updateMock.mockReturnValue({ set });
    const limit = vi.fn().mockResolvedValue([{ name: "Dinda" }]);
    const whereSel = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where: whereSel });
    selectMock.mockReturnValue({ from });

    await updateTaskAssignee({
      id: "task_1",
      userId: "user_2",
      currentUserId: "user_1",
      alsoWatch: true,
    });

    expect(addWatcherMock).toHaveBeenCalledWith({ taskId: "task_1", userId: "user_2" });
  });

  it("does not add a watcher when alsoWatch is false", async () => {
    findFirstMock.mockResolvedValue({ id: "task_1", userId: null, projectId: "project_1", title: "T" });
    const returning = vi.fn().mockResolvedValue([{ id: "task_1", userId: "user_2", projectId: "project_1", title: "T" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    updateMock.mockReturnValue({ set });
    const limit = vi.fn().mockResolvedValue([{ name: "Dinda" }]);
    const whereSel = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where: whereSel });
    selectMock.mockReturnValue({ from });

    await updateTaskAssignee({
      id: "task_1",
      userId: "user_2",
      currentUserId: "user_1",
      alsoWatch: false,
    });

    expect(addWatcherMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaneo/api test -- update-task-assignee-watch`
Expected: FAIL — `alsoWatch` parameter not accepted / watcher never added

- [ ] **Step 3: Extend `update-task-assignee.ts`**

Add the import at the top:

```typescript
import addTaskWatcher from "./add-task-watcher";
```

Change the function signature (currently `{ id, userId, currentUserId }: { id: string; userId: string; currentUserId: string }`) to:

```typescript
async function updateTaskAssignee({
  id,
  userId,
  currentUserId,
  alsoWatch,
}: {
  id: string;
  userId: string;
  currentUserId: string;
  alsoWatch?: boolean;
}) {
```

After the `publishEvent("task.assignee_changed", ...)` call and before the final `return updatedTask;`, add:

```typescript
  if (alsoWatch && userId) {
    await addTaskWatcher({ taskId: updatedTask.id, userId });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaneo/api test -- update-task-assignee-watch`
Expected: PASS

- [ ] **Step 5: Accept `alsoWatch` in the route**

In `apps/api/src/task/index.ts`, find the existing `/assignee/:id` route's JSON body validator (around line 511+) and add the field. If the current validator is:

```typescript
validator("json", v.object({ userId: v.optional(v.string()) })),
```

change it to:

```typescript
validator(
  "json",
  v.object({
    userId: v.optional(v.string()),
    alsoWatch: v.optional(v.boolean()),
  }),
),
```

Update the handler body to destructure and pass through `alsoWatch`:

```typescript
const { userId, alsoWatch } = c.req.valid("json");
const task = await updateTaskAssignee({
  id,
  userId: userId ?? "",
  currentUserId: c.get("userId"),
  alsoWatch,
});
```

(Match this to whatever variable names the existing handler already uses for `id` and `currentUserId` — do not rename existing variables, only add `alsoWatch`.)

- [ ] **Step 6: Run the full API test suite**

Run: `pnpm --filter @kaneo/api test`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/task/controllers/update-task-assignee.ts apps/api/src/task/index.ts tests/api/task/update-task-assignee-watch.test.ts
git commit -m "feat(api): add alsoWatch convenience to assignee updates"
```

---

### Task 6: Notification recipients include watchers

**Files:**
- Find and modify: the recipient-resolution logic in `apps/api/src/notification-preferences/service.ts` (confirm exact function at Step 1)
- Test: `tests/api/notification-preferences/watcher-recipients.test.ts`

**Interfaces:**
- Consumes: `getTaskWatchers` (Task 4)
- Produces: expanded recipient list including watchers, de-duplicated against the assignee

- [ ] **Step 1: Locate the current recipient-resolution function**

Run: `grep -n "assigneeId\|recipient" apps/api/src/notification-preferences/service.ts`

This surfaces the function that currently decides who gets notified for a task event (e.g. something like `resolveRecipients` or `getNotificationRecipients`). Read the ~30 lines around each match to identify the exact function name and its current input/output shape before writing the test in Step 2 — the plan cannot fix this in advance without seeing that file's real contents.

- [ ] **Step 2: Write the failing test**

Create `tests/api/notification-preferences/watcher-recipients.test.ts`, adapting the mock and import to the function name found in Step 1:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTaskWatchersMock = vi.fn();

vi.mock("../../../apps/api/src/task/controllers/get-task-watchers", () => ({
  default: (...args: unknown[]) => getTaskWatchersMock(...args),
}));

// Replace with the actual exported function name found in Step 1.
import { resolveRecipients } from "../../../apps/api/src/notification-preferences/service";

describe("resolveRecipients watcher inclusion", () => {
  beforeEach(() => {
    getTaskWatchersMock.mockReset();
  });

  it("includes watchers alongside the assignee, de-duplicated", async () => {
    getTaskWatchersMock.mockResolvedValue([
      { id: "user_assignee", name: "A", image: null, isSilent: false },
      { id: "user_watcher_2", name: "B", image: null, isSilent: false },
    ]);

    const recipients = await resolveRecipients({
      taskId: "task_1",
      assigneeId: "user_assignee",
    });

    expect(recipients.sort()).toEqual(["user_assignee", "user_watcher_2"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @kaneo/api test -- watcher-recipients`
Expected: FAIL — watchers not yet included in the recipient list

- [ ] **Step 4: Extend the recipient-resolution function**

In `apps/api/src/notification-preferences/service.ts`, add the import:

```typescript
import getTaskWatchers from "../task/controllers/get-task-watchers";
```

Inside the function identified in Step 1, after the existing recipient list is assembled (whatever variable currently holds it — confirm the exact name from the file before editing), add:

```typescript
const watchers = await getTaskWatchers(taskId);
const watcherIds = watchers.map((w) => w.id);
const dedupedRecipientIds = Array.from(
  new Set([...existingRecipientIds, ...watcherIds]),
);
```

Replace the function's final return value with `dedupedRecipientIds` (or merge into whatever richer recipient objects the function already returns, preserving the existing per-recipient shape — read the current return type in Step 1 before finalizing this).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kaneo/api test -- watcher-recipients`
Expected: PASS

- [ ] **Step 6: Run the full API test suite**

Run: `pnpm --filter @kaneo/api test`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/notification-preferences/service.ts tests/api/notification-preferences/watcher-recipients.test.ts
git commit -m "feat(api): include task watchers in notification recipients"
```

---

### Task 7: Frontend — silent-member badge component

**Files:**
- Create: `apps/web/src/components/ui/silent-member-badge.tsx`
- Test: `apps/web/src/components/ui/silent-member-badge.test.tsx`

**Interfaces:**
- Produces: `<SilentMemberBadge />` — a small icon with a tooltip, rendered conditionally by callers when `isSilent` is true

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/ui/silent-member-badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SilentMemberBadge } from "./silent-member-badge";

describe("SilentMemberBadge", () => {
  it("renders an accessible label indicating no login access", () => {
    render(<SilentMemberBadge />);
    expect(screen.getByLabelText(/no login access/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaneo/web test -- silent-member-badge`
Expected: FAIL with "Cannot find module './silent-member-badge'"

- [ ] **Step 3: Implement the badge**

Create `apps/web/src/components/ui/silent-member-badge.tsx`:

```tsx
import { GhostIcon } from "lucide-react";

export function SilentMemberBadge() {
  return (
    <span
      aria-label="Silent member — no login access"
      title="Silent member — no login access"
      className="inline-flex items-center text-muted-foreground"
    >
      <GhostIcon className="h-3 w-3" />
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaneo/web test -- silent-member-badge`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/silent-member-badge.tsx apps/web/src/components/ui/silent-member-badge.test.tsx
git commit -m "feat(web): add silent member badge component"
```

---

### Task 8: Frontend — silent member management page

**Files:**
- Create: `apps/web/src/fetchers/workspace-user/create-silent-member.ts`
- Create: `apps/web/src/hooks/mutations/workspace-user/use-create-silent-member.ts`
- Create: `apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/silent-members.tsx`
- Test: `apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/silent-members.test.tsx`

**Interfaces:**
- Consumes: `POST /workspace/:workspaceId/silent-members` (Task 2), `SilentMemberBadge` (Task 7)
- Produces: a settings page listing silent members with a creation form

- [ ] **Step 1: Create the fetcher**

Create `apps/web/src/fetchers/workspace-user/create-silent-member.ts`:

```typescript
import { apiClient } from "@/lib/api-client";

export async function createSilentMember({
  workspaceId,
  name,
  email,
}: {
  workspaceId: string;
  name: string;
  email?: string;
}) {
  const response = await apiClient.workspace[":workspaceId"][
    "silent-members"
  ].$post({
    param: { workspaceId },
    json: { name, email },
  });

  if (!response.ok) {
    throw new Error("Failed to create silent member");
  }

  return response.json();
}
```

Before finalizing this file, run `grep -n "apiClient" apps/web/src/fetchers/workspace-user/invite-workspace-member.ts` to confirm the exact client import path and call shape used by the existing sibling fetcher, and match it exactly — the hono client's generated method chain must mirror the route path segments defined in Task 2.

- [ ] **Step 2: Create the mutation hook**

Create `apps/web/src/hooks/mutations/workspace-user/use-create-silent-member.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSilentMember } from "@/fetchers/workspace-user/create-silent-member";

export function useCreateSilentMember(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; email?: string }) =>
      createSilentMember({ workspaceId, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-members", workspaceId],
      });
    },
  });
}
```

Confirm the query key `["workspace-members", workspaceId]` matches whatever key the existing `members.tsx` page's query hook actually uses — run `grep -n "queryKey" apps/web/src/hooks/queries/workspace-user/*.ts` and align exactly, so the member list refreshes after creation.

- [ ] **Step 3: Write the failing component test**

Create `apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/silent-members.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/fetchers/workspace-user/create-silent-member", () => ({
  createSilentMember: vi.fn().mockResolvedValue({
    id: "user_1",
    name: "Dinda",
    email: "silent+user_1@noreply.local",
    image: null,
    role: "member",
    isSilent: true,
  }),
}));

import { SilentMembersPage } from "./silent-members";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("SilentMembersPage", () => {
  it("submits the create form with the entered name", async () => {
    renderWithClient(<SilentMembersPage workspaceId="workspace_1" />);

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Dinda" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText("Dinda")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @kaneo/web test -- silent-members`
Expected: FAIL with "Cannot find module './silent-members'"

- [ ] **Step 5: Implement the page**

Create `apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/silent-members.tsx`. Before writing this file, read `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/members.tsx` in full to copy its exact list-rendering markup and route-registration pattern (TanStack Router file-based route export shape), since this plan must not guess at that boilerplate. Structure:

```tsx
import { useState } from "react";
import { SilentMemberBadge } from "@/components/ui/silent-member-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateSilentMember } from "@/hooks/mutations/workspace-user/use-create-silent-member";

export function SilentMembersPage({ workspaceId }: { workspaceId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const { mutate: create, data: members = [] } = useCreateSilentMember(workspaceId);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <label htmlFor="silent-member-name">Name</label>
        <Input
          id="silent-member-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          id="silent-member-email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          onClick={() =>
            create({ name, email: email || undefined })
          }
        >
          Create
        </Button>
      </div>
      <ul>
        {[members].flat().map((member) => (
          <li key={member.id} className="flex items-center gap-2">
            {member.name}
            {member.isSilent && <SilentMemberBadge />}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Note: `data` from a single mutation only reflects the last created member, not the full list. Replace the `data: members = []` line with a proper list query — read `apps/web/src/hooks/queries/workspace-user/` (or wherever `members.tsx` sources its member list) to reuse that existing query hook here, filtered or annotated with `isSilent`, instead of relying on mutation output. Confirm the exact hook name at implementation time.

Wire this into the TanStack Router route tree following the same file-based export convention used by `members.tsx` (confirm the exact route path export syntax by reading that file directly — it varies by TanStack Router version conventions already established in this repo).

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @kaneo/web test -- silent-members`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/fetchers/workspace-user/create-silent-member.ts apps/web/src/hooks/mutations/workspace-user/use-create-silent-member.ts apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/silent-members.tsx apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/silent-members.test.tsx
git commit -m "feat(web): add silent member management page"
```

---

### Task 9: Frontend — watcher popover and assignee "also watch" checkbox

**Files:**
- Create: `apps/web/src/fetchers/task/get-task-watchers.ts`
- Create: `apps/web/src/fetchers/task/add-task-watcher.ts`
- Create: `apps/web/src/fetchers/task/remove-task-watcher.ts`
- Create: `apps/web/src/hooks/queries/task/use-task-watchers.ts`
- Create: `apps/web/src/hooks/mutations/task/use-add-task-watcher.ts`
- Create: `apps/web/src/hooks/mutations/task/use-remove-task-watcher.ts`
- Create: `apps/web/src/components/task/task-watcher-popover.tsx`
- Modify: `apps/web/src/components/task/task-assignee-popover.tsx`
- Test: `apps/web/src/components/task/task-watcher-popover.test.tsx`

**Interfaces:**
- Consumes: `GET/POST/DELETE /task/:id/watchers` (Task 4), `useGetActiveWorkspaceUsers` (existing), `useUpdateTaskAssignee` (existing, extended in Task 5)
- Produces: `<TaskWatcherPopover taskId={...} workspaceId={...} />`

- [ ] **Step 1: Create fetchers**

Create `apps/web/src/fetchers/task/get-task-watchers.ts`:

```typescript
import { apiClient } from "@/lib/api-client";

export async function getTaskWatchers(taskId: string) {
  const response = await apiClient.task[":id"].watchers.$get({
    param: { id: taskId },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch task watchers");
  }
  return response.json();
}
```

Create `apps/web/src/fetchers/task/add-task-watcher.ts`:

```typescript
import { apiClient } from "@/lib/api-client";

export async function addTaskWatcher({
  taskId,
  userId,
}: {
  taskId: string;
  userId: string;
}) {
  const response = await apiClient.task[":id"].watchers.$post({
    param: { id: taskId },
    json: { userId },
  });
  if (!response.ok) {
    throw new Error("Failed to add task watcher");
  }
  return response.json();
}
```

Create `apps/web/src/fetchers/task/remove-task-watcher.ts`:

```typescript
import { apiClient } from "@/lib/api-client";

export async function removeTaskWatcher({
  taskId,
  userId,
}: {
  taskId: string;
  userId: string;
}) {
  const response = await apiClient.task[":id"].watchers[":userId"].$delete({
    param: { id: taskId, userId },
  });
  if (!response.ok) {
    throw new Error("Failed to remove task watcher");
  }
  return response.json();
}
```

Before finalizing these three, read `apps/web/src/fetchers/task/update-task-assignee.ts` in full to confirm the exact `apiClient.task` method-chaining shape this codebase's hono client generates, and match it precisely — the placeholder chain above (`apiClient.task[":id"].watchers...`) must mirror the real generated client shape, not be guessed.

- [ ] **Step 2: Create query/mutation hooks**

Create `apps/web/src/hooks/queries/task/use-task-watchers.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { getTaskWatchers } from "@/fetchers/task/get-task-watchers";

export function useTaskWatchers(taskId: string) {
  return useQuery({
    queryKey: ["task-watchers", taskId],
    queryFn: () => getTaskWatchers(taskId),
  });
}
```

Create `apps/web/src/hooks/mutations/task/use-add-task-watcher.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTaskWatcher } from "@/fetchers/task/add-task-watcher";

export function useAddTaskWatcher(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => addTaskWatcher({ taskId, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-watchers", taskId] });
    },
  });
}
```

Create `apps/web/src/hooks/mutations/task/use-remove-task-watcher.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removeTaskWatcher } from "@/fetchers/task/remove-task-watcher";

export function useRemoveTaskWatcher(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeTaskWatcher({ taskId, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-watchers", taskId] });
    },
  });
}
```

- [ ] **Step 3: Write the failing test for the watcher popover**

Read `apps/web/src/components/task/task-assignee-popover.tsx` in full first, to copy its exact popover/trigger/list markup pattern (this plan must reuse that structure, not invent a new one). Then create `apps/web/src/components/task/task-watcher-popover.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/queries/task/use-task-watchers", () => ({
  useTaskWatchers: () => ({
    data: [{ id: "user_1", name: "Dinda", image: null, isSilent: true }],
  }),
}));

vi.mock("@/hooks/queries/workspace-users/use-get-active-workspace-users", () => ({
  useGetActiveWorkspaceUsers: () => ({
    workspaceUsers: [{ id: "user_1", name: "Dinda", image: null, isSilent: true }],
  }),
}));

import { TaskWatcherPopover } from "./task-watcher-popover";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("TaskWatcherPopover", () => {
  it("shows current watchers including silent members", () => {
    renderWithClient(
      <TaskWatcherPopover taskId="task_1" workspaceId="workspace_1" />,
    );
    expect(screen.getByText("Dinda")).toBeInTheDocument();
  });
});
```

Confirm the exact import path for `useGetActiveWorkspaceUsers` by reading `apps/web/src/components/task/task-assignee-popover.tsx`'s import line — the mock path above must match it exactly.

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @kaneo/web test -- task-watcher-popover`
Expected: FAIL with "Cannot find module './task-watcher-popover'"

- [ ] **Step 5: Implement the watcher popover**

Create `apps/web/src/components/task/task-watcher-popover.tsx`, modeled directly on the structure read in Step 3 but multi-select:

```tsx
import { Check } from "lucide-react";
import { SilentMemberBadge } from "@/components/ui/silent-member-badge";
import { useAddTaskWatcher } from "@/hooks/mutations/task/use-add-task-watcher";
import { useRemoveTaskWatcher } from "@/hooks/mutations/task/use-remove-task-watcher";
import { useTaskWatchers } from "@/hooks/queries/task/use-task-watchers";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";

export function TaskWatcherPopover({
  taskId,
  workspaceId,
}: {
  taskId: string;
  workspaceId: string;
}) {
  const { data: watchers = [] } = useTaskWatchers(taskId);
  const { workspaceUsers = [] } = useGetActiveWorkspaceUsers(workspaceId);
  const { mutate: addWatcher } = useAddTaskWatcher(taskId);
  const { mutate: removeWatcher } = useRemoveTaskWatcher(taskId);

  const watcherIds = new Set(watchers.map((w) => w.id));

  return (
    <ul>
      {workspaceUsers.map((user) => {
        const isWatching = watcherIds.has(user.id);
        return (
          <li key={user.id}>
            <button
              type="button"
              onClick={() =>
                isWatching ? removeWatcher(user.id) : addWatcher(user.id)
              }
            >
              {isWatching && <Check className="h-3 w-3" />}
              {user.name}
              {user.isSilent && <SilentMemberBadge />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

Note: replace the plain `<button>`/`<ul>` markup with whatever Radix popover/command-list primitives the file read in Step 3 actually uses (e.g. `Popover`, `Command`, `CommandItem`) — this plan's markup is a functional placeholder for the interaction logic, not a UI-fidelity match, and Step 3's real file is the source of truth for exact component usage.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @kaneo/web test -- task-watcher-popover`
Expected: PASS

- [ ] **Step 7: Add "Also add as watcher" checkbox to the assignee popover**

In `apps/web/src/components/task/task-assignee-popover.tsx`, add local state for the checkbox (default `true`):

```typescript
const [alsoWatch, setAlsoWatch] = useState(true);
```

Find the existing call to the assignee update mutation (from `useUpdateTaskAssignee`) and add `alsoWatch` to its input object, matching whatever parameter name that hook currently sends (confirm by reading the hook's current mutation function signature before editing — it must match Task 5's `alsoWatch` field name on the backend).

Add the checkbox markup near the popover's action area:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={alsoWatch}
    onChange={(e) => setAlsoWatch(e.target.checked)}
  />
  Also add as watcher
</label>
```

- [ ] **Step 8: Run the full web test suite**

Run: `pnpm --filter @kaneo/web test`
Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/fetchers/task/get-task-watchers.ts apps/web/src/fetchers/task/add-task-watcher.ts apps/web/src/fetchers/task/remove-task-watcher.ts apps/web/src/hooks/queries/task/use-task-watchers.ts apps/web/src/hooks/mutations/task/use-add-task-watcher.ts apps/web/src/hooks/mutations/task/use-remove-task-watcher.ts apps/web/src/components/task/task-watcher-popover.tsx apps/web/src/components/task/task-watcher-popover.test.tsx apps/web/src/components/task/task-assignee-popover.tsx
git commit -m "feat(web): add task watcher popover and assign-time watch checkbox"
```

---

### Task 10: End-to-end manual verification

**Files:** None (manual verification only)

- [ ] **Step 1: Start the dev environment**

Run: `pnpm dev`
Expected: API on `:1337`, web on `:5173`, no startup errors.

- [ ] **Step 2: Create a silent member**

Navigate to workspace settings → silent members page. Create one named "Dinda" with no email.
Expected: appears in the list with a badge; no email is sent (confirm no SMTP log entry / no error if SMTP is unconfigured in local `.env`).

- [ ] **Step 3: Assign a task to the silent member**

Open any task, assign it to "Dinda" via the assignee popover, leave "Also add as watcher" checked, save.
Expected: task shows Dinda as assignee with the badge; task watcher list (via the watcher popover) includes Dinda.

- [ ] **Step 4: Verify the role guard**

Attempt to promote "Dinda" to `admin` from the workspace members/roles settings page.
Expected: request is rejected with an error message referencing silent members.

- [ ] **Step 5: Verify auto-watch on task creation**

Create a new task as the logged-in user.
Expected: the creator appears in that task's watcher list without any manual action.

- [ ] **Step 6: Run the full test suite one final time**

Run: `pnpm test`
Expected: all tests PASS across API and web packages.

---

## Self-Review Notes

- **Spec coverage**: every spec section (schema changes, silent member creation, role guard, watcher CRUD, auto-watch, assign-time convenience, notification integration, management UI, badge, watcher picker, testing) maps to a task above.
- **Unresolved lookups flagged explicitly** rather than guessed: the exact role-update controller filename (Task 3), the notification recipient-resolution function (Task 6), and the generated hono API client's method-chaining shape (Tasks 8-9) all require a short `grep`/read at implementation time before the shown code can be finalized verbatim — these are called out as explicit steps, not silent assumptions, because guessing them risks type/name mismatches the plan cannot verify without repo access at planning time.
