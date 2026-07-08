# Silent Members & Task Watchers — Design

**Status**: Approved for implementation planning
**Scope**: Fork-only feature. Not intended for upstream contribution to `usekaneo/kaneo`.

## Context

Kaneo requires every assignee to be an invited, authenticated workspace member —
inviting always sends a real email via Better Auth's organization plugin
(`sendWorkspaceInvitationEmail` in `apps/api/src/auth.ts`). There is no way to
delegate work to someone (e.g. "Dinda") without either sending them an
unwanted invite email or leaving the task unassigned.

Separately, Kaneo has no concept of "who requested this task" or a
notification subscription list independent of the assignee — notifications
are generated ad hoc from events (assignee changes, comments, etc.) with no
persistent "watching" relationship.

This spec covers two related additions:
1. **Silent members** — real, assignable workspace members created without
   triggering an invite email.
2. **Task watchers** — a per-task subscription list (combined with the
   "who requested this" concept, per decision below) that receives
   notifications on task events, independent of assignment.

## Decisions Locked In

- **Silent members are workspace-scoped**, not project-scoped — created once,
  usable across every project in the workspace, mirroring real members.
- **Silent members are real `userTable` rows** (not a separate table). This
  gives them automatic, zero-cost parity with real members across every
  existing member-sourced UI (assignee picker, filters, task cards, activity
  feed) since they satisfy the same foreign keys and queries.
  - Alternative considered: a separate `placeholder_member` table with no
    auth linkage. Rejected — it avoids coupling to Better Auth's
    internally-managed tables, but requires manually wiring "looks like a
    member" into every current and future member-sourced feature
    (assignee picker, watcher picker, filters, activity feed), a permanent
    maintenance tax. The chosen approach's cost — informal coupling to
    Better Auth's `userTable`/`workspace_member` shape, which could shift on
    a `better-auth` package upgrade — is a one-time, deferred risk. Given
    this is a fork with no upstream contribution obligation, the deferred
    risk was judged preferable to the permanent tax.
- **No auto-login.** Silent members have no password/account row. If the
  real person later wants access, they use Better Auth's existing
  forgot-password flow against the email on file (works because the
  `userTable` row already exists) — no bespoke "claim account" endpoint.
- **Silent members cannot hold admin/owner roles.** Enforced server-side
  (not just hidden in UI), since they can't log in to responsibly exercise
  elevated permissions. Role is fixed to `member` at creation and
  non-editable.
- **Management UI**: a dedicated section in workspace settings (alongside
  the existing `members.tsx` member list), not an inline "+ create" inside
  pickers. Keeps creation deliberate and auditable.
- **Visual distinction**: a small badge/icon next to a silent member's name
  wherever avatars render (assignee popover, member list, task cards),
  driven by a new `isSilent` boolean on `userTable`. Functionally identical
  otherwise.
- **Watchers and "requester" are one combined concept** — a single watcher
  list per task. There is no dedicated "requester" field; whoever is in the
  watcher list (starting with the auto-added creator) fills that role by
  convention. Kaneo has no pre-existing requester/reporter field to
  reconcile against, so this simplification has no migration cost.
- **Task creator is auto-added as a watcher** on task creation.
- **Assigning ≠ watching, but linked by a convenience toggle.** Assignment
  and watching remain independent lists (a silent member can be assigned
  without watching, and vice versa), but the assignee picker offers an
  "Also add as watcher" checkbox (default checked) to cover the common case
  in one action. **Unassigning does not auto-remove a watcher** — loss of
  assignment isn't evidence of lost interest, so that stays an explicit
  action.

## Data Model Changes

### `userTable` — add column
```
isSilent: boolean("is_silent").default(false).notNull()
```
Used purely for the UI badge and for the server-side role guard (silent
members can never be granted `admin`/`owner`).

### New table: `taskWatcherTable`
```
task_watcher: {
  id: text (PK, cuid2)
  taskId: text NOT NULL, references task(id), onDelete cascade, onUpdate cascade
  userId: text NOT NULL, references user(id), onDelete cascade, onUpdate cascade
  createdAt: timestamp, default now, not null
}
indexes: task_watcher_taskId_idx (taskId), task_watcher_userId_idx (userId)
unique constraint: (taskId, userId)
```
Follows the existing schema conventions in `apps/api/src/database/schema.ts`
(CUID2 PK, cascade FKs, indexed FKs, timestamps).

## Backend Changes

### Silent member creation
New controller under `apps/api/src/workspace/controllers/` (e.g.
`create-silent-member.ts`):
1. Validate caller has permission to manage workspace members (reuse
   existing workspace-admin check pattern from
   `apps/api/src/invitation/` or workspace controllers).
2. Insert into `userTable`: `name`, optional `email` (generate a
   non-routable placeholder like `silent+{cuid}@noreply.local` if omitted,
   since `email` is `NOT NULL UNIQUE`), `isSilent: true`, `emailVerified: false`.
3. Insert into `workspaceUserTable`: `workspaceId`, the new `userId`,
   `role: "member"` (hardcoded, not caller-supplied).
4. **Do not** create an `invitationTable` row. **Do not** call
   `sendWorkspaceInvitationEmail`.
5. Return the created member in the same shape as
   `get-workspace-members.ts` uses, so the frontend can reuse existing
   member-list rendering.

Route: `POST /workspace/:workspaceId/silent-members` in a new or extended
section of `apps/api/src/workspace/index.ts`, following the existing
`describeRoute` + Valibot `validator` pattern.

Server-side guard: anywhere workspace roles are updated (existing role
management controller), reject `role: "admin" | "owner"` if the target
user's `isSilent` is `true`.

### Task watchers
New controllers under `apps/api/src/task/controllers/`:
- `add-task-watcher.ts` — insert into `taskWatcherTable`, no-op (or 200) if
  the unique constraint already satisfied.
- `remove-task-watcher.ts` — delete by `(taskId, userId)`.
- `get-task-watchers.ts` — list watchers for a task, joined with `userTable`
  for name/image/isSilent, same shape convention as `assigneeName`/
  `assigneeId` in `get-task.ts`.

Routes in `apps/api/src/task/index.ts`:
- `POST /task/:id/watchers` — body `{ userId: string }`
- `DELETE /task/:id/watchers/:userId`
- Bundle current watcher list into the existing `GET /task/:id` response
  as `watchers: [{ id, name, image, isSilent }]`, avoiding an extra
  round-trip for the common case (viewing a task).

### Task creation — auto-watch
In `create-task.ts`, after the task row is created, insert a
`taskWatcherTable` row for `currentUserId` (the creator).

### Assign → auto-watch convenience
`update-task-assignee.ts` gains an optional `alsoWatch?: boolean` parameter
(default `true` at the API layer, but the frontend always sends it
explicitly based on checkbox state). When `alsoWatch` is true and a
non-null assignee is being set, insert into `taskWatcherTable` for that
`userId` (idempotent via unique constraint — catch/ignore conflict, or
`onConflictDoNothing()` if using Drizzle's upsert helper).

### Notifications
Extend the existing event-driven notification pipeline
(`publishEvent()` / `apps/api/src/events/`) rather than building a parallel
system:
- For task-scoped events that currently notify only the assignee (status
  change, comment, due date change, assignee change), expand the recipient
  resolution to also include current `taskWatcherTable` entries for that
  task, de-duplicated against the assignee (no double notification).
- Watchers still go through each recipient's existing
  `notification-preferences` delivery rules (channel, mute, etc.) — this is
  an additive recipient, not a bypass of preference filtering. The exact
  integration point (likely in `apps/api/src/notification-preferences/service.ts`
  or wherever recipient lists are currently assembled) needs a short read
  during implementation to confirm the precise function to extend.

## Frontend Changes

### Silent member management
New route/section in workspace settings (alongside
`apps/web/src/routes/.../dashboard/settings/workspace/`), following the
existing `members.tsx` list pattern:
- Table/list of silent members (name, email if set, created date)
- "Create silent member" form (name + optional email)
- Delete action (removes `workspace_member` row; leaves the `userTable`
  row as an orphaned historical reference for existing task
  assignments/watcher entries — consistent with how removed real members
  are presumably handled today, to confirm during implementation)

### Assignee popover
`apps/web/src/components/task/task-assignee-popover.tsx`:
- Add "Also add as watcher" checkbox, default checked, submitted alongside
  the assignee mutation.
- Add the silent-member badge/icon next to entries where `isSilent: true`
  in the candidate list (sourced from `useGetActiveWorkspaceUsers`, which
  needs no change since silent members are real `workspace_member` rows).

### Watcher picker (new)
New component `task-watcher-popover.tsx`, modeled directly on
`task-assignee-popover.tsx` but multi-select (checkable list) instead of
single-select, backed by new query/mutation hooks:
- `apps/web/src/hooks/queries/task/use-task-watchers.ts`
- `apps/web/src/hooks/mutations/task/use-add-task-watcher.ts`
- `apps/web/src/hooks/mutations/task/use-remove-task-watcher.ts`
- Fetchers under `apps/web/src/fetchers/task/`

Placement: task detail view, alongside the existing assignee control.

### Badge component
Small shared badge (icon + tooltip, e.g. "Silent member — no login access")
used in: assignee popover, watcher popover, workspace members settings
list, and anywhere else avatars currently render for a task
(task card, activity feed) — reusing whatever avatar component those
already share, adding a conditional badge when `isSilent` is true.

## Testing

- API unit tests (`tests/api/`) for: silent member creation (no invitation
  row created, no email call triggered — mock/spy on
  `sendWorkspaceInvitationEmail`), role-elevation guard rejection, watcher
  add/remove/list, auto-watch on task creation, assign-with-alsoWatch
  idempotency.
- Web unit/component tests (`apps/web` vitest config) for the watcher
  popover and the assignee popover's new checkbox behavior, if existing
  coverage patterns include popover components (to confirm during
  implementation).
- No integration test changes anticipated beyond what naturally follows
  from new endpoints, unless `tests/api-integration/` already has a task
  or workspace-member suite this should extend.

## Out of Scope

- No changes to Better Auth's invite/accept flow for real invitations —
  silent members are an entirely separate code path.
- No bespoke "claim this silent account" flow — forgot-password is the
  claim mechanism, using existing Better Auth infrastructure.
- No changes to sprint/cycle features (confirmed not present in Kaneo).
- No calendar view or analytics dashboard changes.
