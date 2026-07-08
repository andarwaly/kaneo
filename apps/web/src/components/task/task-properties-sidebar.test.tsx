import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({
    data: {
      id: "task_1",
      title: "Task title",
      number: 1,
      status: "to-do",
      priority: "medium",
      startDate: null,
      dueDate: null,
      userId: null,
      projectId: "project_1",
    },
  }),
}));

vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { id: "project_1", slug: "PRJ" } }),
}));

vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({ data: [] }),
}));

vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({ data: { members: [] } }),
  }),
);

vi.mock("@/hooks/queries/workspace-user/use-get-workspace-members", () => ({
  default: () => ({ data: [] }),
}));

vi.mock("@/hooks/queries/label/use-get-labels-by-task", () => ({
  default: () => ({ data: [] }),
}));

vi.mock(
  "@/hooks/queries/github-integration/use-get-github-integration",
  () => ({
    default: () => ({ data: undefined }),
  }),
);

vi.mock("@/hooks/queries/gitea-integration/use-get-gitea-integration", () => ({
  default: () => ({ data: undefined }),
}));

vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canAssignTasks: () => true,
    canManageTasks: () => true,
    canManageProjects: () => true,
    canCreateProjects: () => true,
    canDeleteProjects: () => true,
    canCreateTasks: () => true,
    canManageLabels: () => true,
    canManageWorkspace: () => true,
    canDeleteWorkspace: () => true,
    canInviteUsers: () => true,
    canManageTeam: () => true,
    canRemoveMembers: () => true,
  }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/queries/task/use-task-watchers", () => ({
  useTaskWatchers: () => ({ data: [] }),
}));

vi.mock("@/hooks/mutations/task/use-add-task-watcher", () => ({
  useAddTaskWatcher: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-remove-task-watcher", () => ({
  useRemoveTaskWatcher: () => ({ mutate: vi.fn() }),
}));

import TaskPropertiesSidebar from "./task-properties-sidebar";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("TaskPropertiesSidebar", () => {
  it("mounts the watcher popover trigger alongside the assignee popover", () => {
    renderWithClient(
      <TaskPropertiesSidebar
        taskId="task_1"
        projectId="project_1"
        workspaceId="workspace_1"
      />,
    );

    expect(screen.getAllByText("Watchers").length).toBeGreaterThan(0);
  });
});
