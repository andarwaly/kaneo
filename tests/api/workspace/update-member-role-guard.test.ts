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

import guardSilentMemberRoleUpdate from "../../../apps/api/src/workspace/controllers/guard-silent-member-role-update";

describe("guardSilentMemberRoleUpdate", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it("rejects promoting a silent member to admin", async () => {
    findFirstMock.mockResolvedValue({ id: "user_1", isSilent: true });

    await expect(
      guardSilentMemberRoleUpdate({
        userId: "user_1",
        role: "admin",
      }),
    ).rejects.toThrow(/silent/i);
  });

  it("rejects promoting a silent member to owner", async () => {
    findFirstMock.mockResolvedValue({ id: "user_1", isSilent: true });

    await expect(
      guardSilentMemberRoleUpdate({
        userId: "user_1",
        role: "owner",
      }),
    ).rejects.toThrow(/silent/i);
  });

  it("rejects promoting a silent member when role is an array containing admin", async () => {
    findFirstMock.mockResolvedValue({ id: "user_1", isSilent: true });

    await expect(
      guardSilentMemberRoleUpdate({
        userId: "user_1",
        role: ["member", "admin"],
      }),
    ).rejects.toThrow(/silent/i);
  });

  it("allows promoting a non-silent member to admin", async () => {
    findFirstMock.mockResolvedValue({ id: "user_2", isSilent: false });

    await expect(
      guardSilentMemberRoleUpdate({
        userId: "user_2",
        role: "admin",
      }),
    ).resolves.toBeUndefined();
  });

  it("allows setting a silent member to a non-elevated role without querying the user", async () => {
    await expect(
      guardSilentMemberRoleUpdate({
        userId: "user_1",
        role: "member",
      }),
    ).resolves.toBeUndefined();

    expect(findFirstMock).not.toHaveBeenCalled();
  });
});
