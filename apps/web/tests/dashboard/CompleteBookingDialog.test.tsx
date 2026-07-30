import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompleteBookingDialog } from "@/app/dashboard/_components/CompleteBookingDialog";
import type { BookingForDashboard } from "@/lib/types";

afterEach(cleanup);

function makeBooking(): BookingForDashboard {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    propertyId: "22222222-2222-2222-2222-222222222222",
    propertyName: "La Goccia",
    dataSource: "booking_ical_only",
    hostSkippedCompletion: false,
    guestFullName: "Reserved",
    guestFirstName: null,
    guestPhone: null,
    guestLanguage: null,
    guestCountryCode: null,
    numGuests: 1,
    checkinAt: new Date("2026-05-10T14:00:00Z"),
    checkoutAt: new Date("2026-05-13T11:00:00Z"),
  };
}

describe("CompleteBookingDialog", () => {
  it("submit con campi vuoti mostra messaggi di errore e non chiama l'action", async () => {
    const completeAction = vi.fn<(formData: FormData) => Promise<void>>(
      async () => {},
    );
    const skipAction = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CompleteBookingDialog
        booking={makeBooking()}
        open
        onOpenChange={onOpenChange}
        completeAction={completeAction}
        skipAction={skipAction}
      />,
    );

    // Nome e telefono partono vuoti. La lingua e' un menu a tendina
    // (30/07) e non puo' mai essere vuota: il suo errore di validazione
    // e' irraggiungibile by design.
    await user.click(
      screen.getByRole("button", { name: /Salva e attiva Premura/i }),
    );

    expect(
      await screen.findByText("Il nome deve avere almeno 2 caratteri"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Il telefono deve avere almeno 8 caratteri"),
    ).toBeInTheDocument();

    expect(completeAction).not.toHaveBeenCalled();
  });

  it("submit con campi validi chiama completeAction con FormData popolato", async () => {
    const completeAction = vi.fn<(formData: FormData) => Promise<void>>(
      async () => {},
    );
    const skipAction = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CompleteBookingDialog
        booking={makeBooking()}
        open
        onOpenChange={onOpenChange}
        completeAction={completeAction}
        skipAction={skipAction}
      />,
    );

    await user.type(screen.getByLabelText("Nome dell'ospite"), "Mario Rossi");
    await user.type(screen.getByLabelText("Telefono"), "+393331234567");

    await user.click(
      screen.getByRole("button", { name: /Salva e attiva Premura/i }),
    );

    await waitFor(() => {
      expect(completeAction).toHaveBeenCalledTimes(1);
    });

    const fd = completeAction.mock.calls[0]![0];
    expect(fd.get("bookingId")).toBe("11111111-1111-1111-1111-111111111111");
    expect(fd.get("guestFullName")).toBe("Mario Rossi");
    expect(fd.get("guestPhone")).toBe("+393331234567");
    expect(fd.get("guestLanguage")).toBe("it");
    expect(fd.get("numGuests")).toBeNull();

    // Successo => chiude il dialog.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("click su 'Salta per ora' chiama skipAction con bookingId", async () => {
    const completeAction = vi.fn<(formData: FormData) => Promise<void>>(
      async () => {},
    );
    const skipAction = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CompleteBookingDialog
        booking={makeBooking()}
        open
        onOpenChange={onOpenChange}
        completeAction={completeAction}
        skipAction={skipAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Salta per ora/i }));

    await waitFor(() => {
      expect(skipAction).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111",
      );
    });
    expect(completeAction).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
