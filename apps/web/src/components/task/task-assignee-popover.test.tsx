import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({
      data: {
        members: [
          {
            userId: "user_1",
            user: { name: "Dinda", image: null },
          },
        ],
      },
    }),
  }),
);

vi.mock("@/hooks/queries/workspace-user/use-get-workspace-members", () => ({
  default: () => ({
    data: [
      {
        id: "user_1",
        name: "Dinda",
        email: "dinda@example.com",
        image: null,
        role: "member",
        isSilent: true,
      },
    ],
  }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canAssignTasks: () => true,
  }),
}));

import TaskAssigneePopover from "./task-assignee-popover";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("TaskAssigneePopover", () => {
  it("shows a silent member badge for silent workspace members", async () => {
    renderWithClient(
      <TaskAssigneePopover
        task={{ id: "task_1", userId: null } as never}
        workspaceId="workspace_1"
      >
        <button type="button">Assignee</button>
      </TaskAssigneePopover>,
    );

    fireEvent.click(screen.getByText("Assignee"));

    expect(await screen.findByText("Dinda")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /silent member/i }),
    ).toBeInTheDocument();
  });
});
