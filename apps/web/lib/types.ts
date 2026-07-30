// Tipi UI per la dashboard host.
//
// La verita di dominio (lista valori, classificazione RICH/INCOMPLETE,
// type guard) vive in packages/shared/src/booking-data-richness.ts ed
// e' condivisa con apps/api. Qui ri-esportiamo solo cio' che serve ai
// componenti React.

import {
  isRichDataSource,
  isIncompleteDataSource,
  isKnownDataSource,
  type DataSource,
} from "@premura/shared";

export {
  isRichDataSource,
  isIncompleteDataSource,
  isKnownDataSource,
  type DataSource,
};

// Shape consumata dai componenti dashboard. Sottoinsieme di
// packages/db/src/schema/bookings.ts esteso col nome della property (join).
// Le mutazioni (complete-manual, skip-completion) usano direttamente l'id.
export type BookingForDashboard = {
  id: string;
  propertyId: string;
  propertyName: string;
  /** Colore della struttura (sistema colori 30/07). */
  propertyColor: string | null;
  dataSource: DataSource;
  hostSkippedCompletion: boolean;
  guestFullName: string;
  guestFirstName: string | null;
  guestPhone: string | null;
  guestLanguage: string | null;
  guestCountryCode: string | null;
  numGuests: number;
  checkinAt: Date;
  checkoutAt: Date;
};
