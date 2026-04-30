import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del modulo getCurrentHostId, getDb, findOwnership e api HTTP.
// Le server actions importano tutto da questi entry, intercettiamoli.

const mocks = vi.hoisted(() => ({
  getCurrentHostId: vi.fn(),
  getDb: vi.fn(),
  findOwnership: vi.fn(),
  completeBookingManual: vi.fn(),
  skipBookingCompletion: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentHostId: mocks.getCurrentHostId,
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/repositories/bookings", () => ({
  findOwnership: mocks.findOwnership,
}));

vi.mock("@/lib/api", () => ({
  completeBookingManual: mocks.completeBookingManual,
  skipBookingCompletion: mocks.skipBookingCompletion,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  completeBookingAction,
  skipBookingAction,
} from "@/app/dashboard/actions";

const HOST = "11111111-1111-1111-1111-111111111111";
const OTHER_HOST = "22222222-2222-2222-2222-222222222222";
const BOOKING = "33333333-3333-3333-3333-333333333333";

function makeFormData(bookingId: string): FormData {
  const fd = new FormData();
  fd.set("bookingId", bookingId);
  fd.set("guestFullName", "Mario Rossi");
  fd.set("guestPhone", "+393331234567");
  fd.set("guestLanguage", "it");
  return fd;
}

describe("completeBookingAction - ownership pre-check", () => {
  beforeEach(() => {
    mocks.getCurrentHostId.mockReset().mockResolvedValue(HOST);
    mocks.getDb.mockReset().mockResolvedValue({ db: {} });
    mocks.findOwnership.mockReset();
    mocks.completeBookingManual.mockReset().mockResolvedValue(undefined);
    mocks.skipBookingCompletion.mockReset().mockResolvedValue(undefined);
    mocks.revalidatePath.mockReset();
  });

  it("booking inesistente -> throw 'Booking non trovata' senza chiamare API", async () => {
    mocks.findOwnership.mockResolvedValue(null);
    await expect(
      completeBookingAction(makeFormData(BOOKING)),
    ).rejects.toThrow("Booking non trovata");
    expect(mocks.completeBookingManual).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("booking di altro host -> throw stesso messaggio (no info disclosure)", async () => {
    mocks.findOwnership.mockResolvedValue({ hostId: OTHER_HOST });
    await expect(
      completeBookingAction(makeFormData(BOOKING)),
    ).rejects.toThrow("Booking non trovata");
    expect(mocks.completeBookingManual).not.toHaveBeenCalled();
  });

  it("booking propria -> chiama completeBookingManual e revalidatePath", async () => {
    mocks.findOwnership.mockResolvedValue({ hostId: HOST });
    await completeBookingAction(makeFormData(BOOKING));
    expect(mocks.completeBookingManual).toHaveBeenCalledWith(BOOKING, {
      guestFullName: "Mario Rossi",
      guestPhone: "+393331234567",
      guestLanguage: "it",
      numGuests: undefined,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});

describe("skipBookingAction - ownership pre-check", () => {
  beforeEach(() => {
    mocks.getCurrentHostId.mockReset().mockResolvedValue(HOST);
    mocks.getDb.mockReset().mockResolvedValue({ db: {} });
    mocks.findOwnership.mockReset();
    mocks.skipBookingCompletion.mockReset().mockResolvedValue(undefined);
    mocks.revalidatePath.mockReset();
  });

  it("booking inesistente -> throw, niente HTTP", async () => {
    mocks.findOwnership.mockResolvedValue(null);
    await expect(skipBookingAction(BOOKING)).rejects.toThrow(
      "Booking non trovata",
    );
    expect(mocks.skipBookingCompletion).not.toHaveBeenCalled();
  });

  it("booking di altro host -> throw stesso messaggio", async () => {
    mocks.findOwnership.mockResolvedValue({ hostId: OTHER_HOST });
    await expect(skipBookingAction(BOOKING)).rejects.toThrow(
      "Booking non trovata",
    );
    expect(mocks.skipBookingCompletion).not.toHaveBeenCalled();
  });

  it("booking propria -> chiama skipBookingCompletion e revalidatePath", async () => {
    mocks.findOwnership.mockResolvedValue({ hostId: HOST });
    await skipBookingAction(BOOKING);
    expect(mocks.skipBookingCompletion).toHaveBeenCalledWith(BOOKING);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});
