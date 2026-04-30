import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BookingRow } from "@/app/dashboard/_components/BookingRow";
import type { BookingForDashboard, DataSource } from "@/lib/types";

afterEach(cleanup);

const noopComplete = async () => {};
const noopSkip = async () => {};

function makeBooking(
  overrides: Partial<BookingForDashboard> = {},
): BookingForDashboard {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    propertyId: "22222222-2222-2222-2222-222222222222",
    propertyName: "La Goccia",
    dataSource: "booking_ical_only",
    hostSkippedCompletion: false,
    guestFullName: "Mario Rossi",
    guestFirstName: "Mario",
    guestPhone: null,
    guestLanguage: "it",
    guestCountryCode: "IT",
    numGuests: 2,
    checkinAt: new Date("2026-05-10T14:00:00Z"),
    checkoutAt: new Date("2026-05-13T11:00:00Z"),
    ...overrides,
  };
}

type Case = {
  dataSource: DataSource;
  hostSkipped?: boolean;
  expectedBadge: string;
};

const CASES: Case[] = [
  { dataSource: "airbnb_email_parsed", expectedBadge: "Airbnb" },
  { dataSource: "booking_manual_filled", expectedBadge: "Booking · completata" },
  { dataSource: "booking_via_channel_manager", expectedBadge: "Channel manager" },
  { dataSource: "booking_ical_only", expectedBadge: "Booking · da completare" },
  { dataSource: "booking_email_only", expectedBadge: "Booking · email" },
  { dataSource: "airbnb_ical_only", expectedBadge: "Airbnb · in attesa" },
  { dataSource: "unknown", expectedBadge: "In attesa" },
];

describe("BookingRow badge per data_source", () => {
  for (const c of CASES) {
    it(`badge "${c.expectedBadge}" per data_source=${c.dataSource}`, () => {
      render(
        <BookingRow
          booking={makeBooking({ dataSource: c.dataSource })}
          completeAction={noopComplete}
          skipAction={noopSkip}
        />,
      );
      expect(screen.getByText(c.expectedBadge)).toBeInTheDocument();
    });
  }

  it('badge "Saltata" prevale quando hostSkippedCompletion = true', () => {
    render(
      <BookingRow
        booking={makeBooking({
          dataSource: "booking_ical_only",
          hostSkippedCompletion: true,
        })}
        completeAction={noopComplete}
        skipAction={noopSkip}
      />,
    );
    expect(screen.getByText("Saltata")).toBeInTheDocument();
    expect(
      screen.queryByText("Booking · da completare"),
    ).not.toBeInTheDocument();
  });

  it("INCOMPLETE non skipped maschera il nome ospite con \"Ospite\"", () => {
    render(
      <BookingRow
        booking={makeBooking({
          dataSource: "booking_ical_only",
          guestFullName: "Mario Rossi",
        })}
        completeAction={noopComplete}
        skipAction={noopSkip}
      />,
    );
    expect(screen.getByText("Ospite")).toBeInTheDocument();
    expect(screen.queryByText("Mario Rossi")).not.toBeInTheDocument();
  });

  it("INCOMPLETE non skipped rende un button (apre dialog), RICH rende un div", () => {
    const { rerender } = render(
      <BookingRow
        booking={makeBooking({ dataSource: "booking_ical_only" })}
        completeAction={noopComplete}
        skipAction={noopSkip}
      />,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
    rerender(
      <BookingRow
        booking={makeBooking({ dataSource: "airbnb_email_parsed" })}
        completeAction={noopComplete}
        skipAction={noopSkip}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
