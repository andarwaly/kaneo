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
