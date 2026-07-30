import { describe, expect, it } from 'vitest';
import {
  composeGuestAppInvite,
  guestAppInviteDisclosures,
} from '../src/outbound/guest-app-invite-content';

// Invito guest app (flusso canonico §2b): contenuto FISSO, pinnato
// parola per parola come il benvenuto. Se una riga cambia, il test
// fallisce e il cambiamento diventa una decisione, non un incidente.

describe('composeGuestAppInvite', () => {
  it('EN: disclosure con nome struttura, presenza, link, canale aperto, firma', () => {
    const body = composeGuestAppInvite({
      guestFirstName: 'Julian',
      guestFullName: 'Julian Falch Milde',
      propertyName: 'Villa Cristina',
      language: 'no',
      guestAppUrl: 'https://andreachiacchio.github.io/villa-cristina-guest-app/',
    });

    expect(body).toBe(
      [
        'Hi! You’re chatting with Villa Cristina’s automated assistant.',
        '',
        "Julian, we're getting everything ready for your stay.",
        '',
        "Here you'll find the house guide and our local services (tours, transfers, private chef): https://andreachiacchio.github.io/villa-cristina-guest-app/",
        '',
        'From now on you can write here for anything you need.',
        '',
        'See you soon,',
        'Villa Cristina',
      ].join('\n'),
    );
    // Correzioni Andrea 30/07: nessuna promessa sulla velocita' di
    // risposta; il nome struttura solo in disclosure e firma.
    expect(body).not.toMatch(/right away|subito/i);
    expect(body.split('Villa Cristina').length - 1).toBe(2);
  });

  it('IT: stessa struttura in italiano', () => {
    const body = composeGuestAppInvite({
      guestFirstName: 'Mario',
      guestFullName: 'Mario Rossi',
      propertyName: 'La Goccia di San Gennaro',
      language: 'it',
      guestAppUrl: 'https://esempio.it/app',
    });

    expect(body).toContain(
      'Ciao! Ti risponde l’assistente automatico di La Goccia di San Gennaro.',
    );
    expect(body).toContain('Mario, stiamo preparando tutto per il tuo soggiorno.');
    expect(body).toContain('https://esempio.it/app');
    expect(body).toContain('Da ora puoi scrivere qui per qualsiasi cosa ti serva.');
    expect(body.endsWith('A presto,\nLa Goccia di San Gennaro')).toBe(true);
  });

  it('la disclosure usa il NOME DELLA STRUTTURA, mai Villa Cristina fissa', () => {
    const body = composeGuestAppInvite({
      guestFirstName: 'Anna',
      guestFullName: 'Anna Bianchi',
      propertyName: 'La Napoli Sotterranea',
      language: 'en',
      guestAppUrl: 'https://esempio.it/app',
    });
    expect(body).toContain('La Napoli Sotterranea’s automated assistant');
    expect(body).not.toContain('Villa Cristina');
  });

  it('il custom dell\'host vince sulla formula standard', () => {
    const disclosures = guestAppInviteDisclosures('Villa Cristina', {
      it: 'Testo custom italiano di disclosure.',
      en: null,
    });
    expect(disclosures.it).toBe('Testo custom italiano di disclosure.');
    expect(disclosures.en).toContain('Villa Cristina’s automated assistant');
  });

  it('mai promesse non mantenute: niente "human"/"operatore"', () => {
    const body = composeGuestAppInvite({
      guestFirstName: 'Julian',
      guestFullName: 'Julian Falch Milde',
      propertyName: 'Villa Cristina',
      language: 'en',
      guestAppUrl: 'https://esempio.it/app',
    });
    expect(body).not.toMatch(/human|operatore/i);
  });
});
