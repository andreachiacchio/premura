import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { IncompleteAlert } from "@/app/dashboard/_components/IncompleteAlert";

afterEach(cleanup);

describe("IncompleteAlert", () => {
  it("non renderizza nulla quando count = 0", () => {
    const { container } = render(<IncompleteAlert count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renderizza la card peach con plurale quando count > 1", () => {
    render(<IncompleteAlert count={5} />);
    expect(
      screen.getByText("5 prenotazioni Booking da completare"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Servono pochi dati per ognuna"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "#incomplete");
  });

  it("usa singolare quando count === 1", () => {
    render(<IncompleteAlert count={1} />);
    expect(
      screen.getByText("1 prenotazione Booking da completare"),
    ).toBeInTheDocument();
  });
});
