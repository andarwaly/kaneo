import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/fetchers/workspace-user/create-silent-member", () => ({
  default: vi.fn().mockResolvedValue({
    id: "user_1",
    name: "Dinda",
    email: "silent+user_1@noreply.local",
    image: null,
    role: "member",
    isSilent: true,
  }),
}));

vi.mock("@/hooks/queries/workspace-user/use-get-workspace-members", () => ({
  default: vi.fn(() => ({
    data: [
      {
        id: "user_1",
        name: "Dinda",
        email: "silent+user_1@noreply.local",
        image: null,
        role: "member",
        isSilent: true,
      },
    ],
    isLoading: false,
    isError: false,
  })),
}));

import { SilentMembersPage } from "./silent-members";

function renderWithClient(ui: ReactElement) {
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
