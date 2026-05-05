import { OnboardingShell } from '../_components/OnboardingShell';
import { submitFirstPropertyAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function OnboardingPropertyPage() {
  return (
    <OnboardingShell
      step="property"
      title="Aggiungi la tua prima struttura"
      subtitle="Premura gestira' le prenotazioni e i messaggi degli ospiti per questa struttura."
    >
      <form action={submitFirstPropertyAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-blu-deep">Nome struttura</span>
          <input
            type="text"
            name="name"
            required
            minLength={2}
            maxLength={255}
            placeholder="La Goccia di S.Gennaro"
            className="rounded-input border border-blu-deep/20 bg-white px-3 py-2.5 font-inter text-[15px] text-blu-deep focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-blu-deep">Citta'</span>
          <input
            type="text"
            name="city"
            required
            minLength={2}
            maxLength={128}
            placeholder="Napoli"
            className="rounded-input border border-blu-deep/20 bg-white px-3 py-2.5 font-inter text-[15px] text-blu-deep focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-blu-deep">
            URL iCal Booking <span className="text-blu-deep/50">(opzionale)</span>
          </span>
          <input
            type="url"
            name="icalBookingUrl"
            placeholder="https://ical.booking.com/v1/export?t=..."
            className="rounded-input border border-blu-deep/20 bg-white px-3 py-2.5 font-inter text-[14px] text-blu-deep focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20"
          />
          <span className="text-[12px] text-blu-deep/60">
            Lo trovi su admin.booking.com &rarr; Calendari &rarr; Esporta calendario.
          </span>
        </label>

        <button
          type="submit"
          className="mt-4 w-full rounded-button bg-terracotta px-4 py-3 font-semibold text-ivory transition-opacity hover:opacity-90"
        >
          Continua
        </button>
      </form>
    </OnboardingShell>
  );
}
