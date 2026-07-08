import { beforeEach, describe, expect, it, vi } from "vitest";

const getTaskWatchersMock = vi.fn();

vi.mock("../../../apps/api/src/task/controllers/get-task-watchers", () => ({
  default: (...args: unknown[]) => getTaskWatchersMock(...args),
}));

import { resolveTaskNotificationRecipients } from "../../../apps/api/src/notification";

describe("resolveTaskNotificationRecipients", () => {
  beforeEach(() => {
    getTaskWatchersMock.mockReset();
  });

  it("includes non-silent watchers alongside the primary recipient, de-duplicated", async () => {
    getTaskWatchersMock.mockResolvedValue([
      { id: "user_assignee", name: "A", image: null, isSilent: false },
      { id: "user_watcher_2", name: "B", image: null, isSilent: false },
    ]);

    const recipients = await resolveTaskNotificationRecipients(
      "task_1",
      "user_assignee",
    );

    expect(recipients.sort()).toEqual(["user_assignee", "user_watcher_2"]);
  });

  it("excludes watchers flagged isSilent", async () => {
    getTaskWatchersMock.mockResolvedValue([
      { id: "user_assignee", name: "A", image: null, isSilent: false },
      { id: "user_silent_watcher", name: "C", image: null, isSilent: true },
    ]);

    const recipients = await resolveTaskNotificationRecipients(
      "task_1",
      "user_assignee",
    );

    expect(recipients.sort()).toEqual(["user_assignee"]);
  });

  it("works with no primary recipient", async () => {
    getTaskWatchersMock.mockResolvedValue([
      { id: "user_watcher_1", name: "D", image: null, isSilent: false },
    ]);

    const recipients = await resolveTaskNotificationRecipients("task_1");

    expect(recipients.sort()).toEqual(["user_watcher_1"]);
  });
});
