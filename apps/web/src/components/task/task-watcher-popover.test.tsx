import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/queries/task/use-task-watchers", () => ({
  useTaskWatchers: () => ({
    data: [{ id: "user_1", name: "Dinda", image: null, isSilent: true }],
  }),
}));

vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({
      data: {
        members: [
          {
            userId: "user_1",
            user: { name: "Dinda", image: null },
            isSilent: true,
          },
        ],
      },
    }),
  }),
);

vi.mock("@/hooks/mutations/task/use-add-task-watcher", () => ({
  useAddTaskWatcher: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-remove-task-watcher", () => ({
  useRemoveTaskWatcher: () => ({ mutate: vi.fn() }),
}));

import { TaskWatcherPopover } from "./task-watcher-popover";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("TaskWatcherPopover", () => {
  it("shows current watchers including silent members", async () => {
    renderWithClient(
      <TaskWatcherPopover taskId="task_1" workspaceId="workspace_1">
        <button type="button">Watchers</button>
      </TaskWatcherPopover>,
    );

    fireEvent.click(screen.getByText("Watchers"));

    expect(await screen.findByText("Dinda")).toBeInTheDocument();
  });
});
