import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SilentMemberBadge } from "./silent-member-badge";

describe("SilentMemberBadge", () => {
  it("renders an accessible label indicating no login access", () => {
    render(<SilentMemberBadge />);
    expect(screen.getByLabelText(/no login access/i)).toBeInTheDocument();
  });
});
