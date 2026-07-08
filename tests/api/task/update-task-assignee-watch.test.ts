import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMock = vi.fn();
const updateMock = vi.fn();
const selectMock = vi.fn();
const addWatcherMock = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      taskTable: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
    },
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
    findFirstMock.mockResolvedValue({
      id: "task_1",
      userId: null,
      projectId: "project_1",
      title: "T",
    });
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: "task_1", userId: "user_2", projectId: "project_1", title: "T" },
      ]);
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

    expect(addWatcherMock).toHaveBeenCalledWith({
      taskId: "task_1",
      userId: "user_2",
    });
  });

  it("does not add a watcher when alsoWatch is false", async () => {
    findFirstMock.mockResolvedValue({
      id: "task_1",
      userId: null,
      projectId: "project_1",
      title: "T",
    });
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: "task_1", userId: "user_2", projectId: "project_1", title: "T" },
      ]);
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
