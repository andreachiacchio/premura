import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyOnboardingState } from "@/app/dashboard/_components/EmptyOnboardingState";

afterEach(cleanup);

describe("EmptyOnboardingState", () => {
  it("renderizza titolo benvenuto e bottone aggiungi struttura", () => {
    render(<EmptyOnboardingState createAction={vi.fn()} />);
    expect(screen.getByText("Benvenuto su Premura.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Aggiungi struttura/i }),
    ).toBeInTheDocument();
  });

  it("dialog chiuso di default, click bottone lo apre", async () => {
    const user = userEvent.setup();
    render(<EmptyOnboardingState createAction={vi.fn()} />);

    expect(
      screen.queryByText("Aggiungi la tua struttura"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Aggiungi struttura/i }),
    );

    expect(
      await screen.findByText("Aggiungi la tua struttura"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome struttura")).toBeInTheDocument();
    expect(screen.getByLabelText("Citta'")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Link iCal Booking/i),
    ).toBeInTheDocument();
  });

  it("submit valido (solo name + city) chiama action con FormData", async () => {
    const action = vi.fn<(formData: FormData) => Promise<void>>(
      async () => {},
    );
    const user = userEvent.setup();
    render(<EmptyOnboardingState createAction={action} />);

    await user.click(
      screen.getByRole("button", { name: /Aggiungi struttura/i }),
    );
    await user.type(screen.getByLabelText("Nome struttura"), "La Goccia");
    await user.click(screen.getByRole("button", { name: /Salva e inizia/i }));

    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    const fd = action.mock.calls[0]![0];
    expect(fd.get("name")).toBe("La Goccia");
    // Default Napoli
    expect(fd.get("city")).toBe("Napoli");
    // iCal vuoto, NON deve essere inviato
    expect(fd.get("icalBookingUrl")).toBeNull();
  });

  it("submit con name vuoto mostra errore zod e non chiama action", async () => {
    const action = vi.fn<(formData: FormData) => Promise<void>>(
      async () => {},
    );
    const user = userEvent.setup();
    render(<EmptyOnboardingState createAction={action} />);

    await user.click(
      screen.getByRole("button", { name: /Aggiungi struttura/i }),
    );
    // Lascio name vuoto e provo submit
    await user.click(screen.getByRole("button", { name: /Salva e inizia/i }));

    expect(
      await screen.findByText("Il nome deve avere almeno 2 caratteri"),
    ).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("submit con iCal URL malformato mostra errore zod", async () => {
    const action = vi.fn<(formData: FormData) => Promise<void>>(
      async () => {},
    );
    const user = userEvent.setup();
    render(<EmptyOnboardingState createAction={action} />);

    await user.click(
      screen.getByRole("button", { name: /Aggiungi struttura/i }),
    );
    await user.type(screen.getByLabelText("Nome struttura"), "La Goccia");
    await user.type(
      screen.getByLabelText(/Link iCal Booking/i),
      "non-un-url",
    );
    await user.click(screen.getByRole("button", { name: /Salva e inizia/i }));

    expect(await screen.findByText("URL non valido")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("submit con iCal URL valido include icalBookingUrl in FormData", async () => {
    const action = vi.fn<(formData: FormData) => Promise<void>>(
      async () => {},
    );
    const user = userEvent.setup();
    render(<EmptyOnboardingState createAction={action} />);

    await user.click(
      screen.getByRole("button", { name: /Aggiungi struttura/i }),
    );
    await user.type(screen.getByLabelText("Nome struttura"), "La Goccia");
    await user.type(
      screen.getByLabelText(/Link iCal Booking/i),
      "https://ical.booking.com/v1/export?token=abc",
    );
    await user.click(screen.getByRole("button", { name: /Salva e inizia/i }));

    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    const fd = action.mock.calls[0]![0];
    expect(fd.get("icalBookingUrl")).toBe(
      "https://ical.booking.com/v1/export?token=abc",
    );
  });
});
