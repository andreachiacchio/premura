"use server";

// Server actions per la dashboard host (slice 5 sezione E).
// Questo file e' uno stub temporaneo per slice 5 sezione D: espone le
// firme che il dialog client usa via prop, in modo che la pagina
// compili. La logica completa (validazione zod, chiamata
// completeBookingManual / skipBookingCompletion, revalidatePath) arriva
// in slice 5 sezione E.

export async function completeBookingAction(_formData: FormData): Promise<void> {
  throw new Error(
    "[dashboard] completeBookingAction non implementata: stub slice 5 sezione D, completare in sezione E.",
  );
}

export async function skipBookingAction(_bookingId: string): Promise<void> {
  throw new Error(
    "[dashboard] skipBookingAction non implementata: stub slice 5 sezione D, completare in sezione E.",
  );
}
