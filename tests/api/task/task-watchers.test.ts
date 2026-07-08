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
    const where = vi
      .fn()
      .mockResolvedValue([
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
