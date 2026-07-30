// Nomi segnaposto dell'iCal ("Booking Guest", "Reserved", "Ospite"):
// dove il nome vero manca si scrive "Un ospite" e si mette la struttura
// in evidenza (home desktop, punto 6 — 30/07). Un elenco di venti
// "Booking Guest" identici non comunica niente.

const PLACEHOLDER_NAMES = new Set(['ospite', 'reserved', 'booking guest']);

export function hasRealGuestName(fullName: string): boolean {
  const name = fullName.trim().toLowerCase();
  return name.length > 0 && !PLACEHOLDER_NAMES.has(name);
}

export function displayGuestName(fullName: string, firstName: string | null): string {
  if (!hasRealGuestName(fullName)) return 'Un ospite';
  return (firstName ?? fullName).trim() || 'Un ospite';
}
