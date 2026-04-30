import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renderizza prosa calma quando non ci sono prenotazioni da completare", () => {
    render(<EmptyState />);
    expect(
      screen.getByText("Tutte le prenotazioni sono complete."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Premura puo lavorare in autonomia."),
    ).toBeInTheDocument();
  });

  it("usa role=status per assistive tech", () => {
    render(<EmptyState />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
