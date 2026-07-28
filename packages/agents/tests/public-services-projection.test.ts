import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type PublicService, toPublicService } from '../src/public-services';

/**
 * Il catalogo pubblico non deve MAI esporre il costo fornitore né il
 * margine, "nemmeno se non renderizzati": un oggetto passato a un
 * componente viene serializzato per intero nel payload RSC e resta
 * leggibile nel sorgente della pagina.
 *
 * Questi test partono da una riga che il costo ce l'ha e verificano che
 * la proiezione lo lasci indietro.
 */

// Riga completa come arriva dal DB, costo fornitore incluso.
const RIGA_COMPLETA = {
  id: '11111111-1111-1111-1111-111111111111',
  propertyId: '22222222-2222-2222-2222-222222222222',
  slug: 'boat-tour-full-day',
  category: 'boat_tour',
  titleEn: 'Gozzo Boat Tour — Full Day',
  titleIt: 'Giro in gozzo — Giornata intera',
  descriptionEn: 'Private tour with local skipper.',
  descriptionIt: 'Tour privato con skipper locale.',
  photoUrl: 'https://example.test/gozzo.jpg',
  // ─── dati interni che NON devono uscire ───
  supplierCostEur: '800.00',
  supplierName: 'Ad Maiora Charter',
  supplierNotes: 'Commissione 10% inclusa nel listino',
  // ─────────────────────────────────────────
  salePriceEur: '900.00',
  priceOnRequest: false,
  priceUnitEn: 'per boat',
  priceUnitIt: 'a barca',
  durationLabelEn: '7h · 9:30–16:30',
  durationLabelIt: '7h · 9:30–16:30',
  sortOrder: 10,
  isFeatured: true,
  isActive: true,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

const NUMERO_UFFICIALE = '+39 351 451 2070';

describe('proiezione pubblica del catalogo servizi', () => {
  describe('il costo fornitore non esce', () => {
    it('nessuna chiave di costo nella proiezione', () => {
      const pub = toPublicService(RIGA_COMPLETA, NUMERO_UFFICIALE, 'it');
      const chiavi = Object.keys(pub).map((k) => k.toLowerCase());

      for (const proibita of ['suppliercosteur', 'suppliername', 'suppliernotes', 'margin', 'margine', 'cost']) {
        expect(chiavi, `la chiave "${proibita}" non deve comparire`).not.toContain(proibita);
      }
    });

    it('nessun valore interno nel JSON serializzato', () => {
      // È il test che conta: quello che finisce nel payload RSC è
      // esattamente questa stringa.
      const json = JSON.stringify(toPublicService(RIGA_COMPLETA, NUMERO_UFFICIALE, 'it'));

      expect(json).not.toContain('800.00'); // costo fornitore
      expect(json).not.toContain('Ad Maiora'); // nome fornitore
      expect(json).not.toContain('Commissione'); // note interne
      expect(json).not.toContain('10%'); // commissione

      // Il prezzo di vendita invece DEVE esserci: è quello che l'ospite paga.
      expect(json).toContain('900.00');
    });

    it('il margine non è ricostruibile: nessun campo lo espone', () => {
      const pub = toPublicService(RIGA_COMPLETA, NUMERO_UFFICIALE, 'it') as Record<string, unknown>;
      const valori = Object.values(pub).map((v) => String(v));

      // 100.00 = 900 - 800. Nessun campo deve contenerlo.
      expect(valori.some((v) => v.includes('100.00'))).toBe(false);
    });

    it('la proiezione ha esattamente i campi previsti, niente di più', () => {
      const attesi: Array<keyof PublicService> = [
        'id',
        'slug',
        'category',
        'title',
        'description',
        'photoUrl',
        'priceEur',
        'priceOnRequest',
        'priceUnit',
        'durationLabel',
        'isFeatured',
        'whatsappUrl',
      ];
      expect(Object.keys(toPublicService(RIGA_COMPLETA, NUMERO_UFFICIALE, 'it')).sort()).toEqual(
        [...attesi].sort(),
      );
    });
  });

  describe('la query non deve usare select() senza proiezione', () => {
    it('public-services.ts elenca le colonne a mano', () => {
      // Difesa contro la regressione più probabile: qualcuno sostituisce
      // .select({...}) con .select() per comodità e riporta dentro tutte
      // le colonne, costo fornitore incluso.
      const src = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'public-services.ts'),
        'utf8',
      );

      expect(src, 'select() senza proiezione esplicita').not.toMatch(/\.select\(\s*\)/);
      expect(src).toContain('.select({');
      // Le colonne interne non devono proprio essere nominate nella query.
      expect(src).not.toContain('services.supplierCostEur');
      expect(src).not.toContain('services.supplierNotes');
    });
  });

  describe('contenuto lato ospite', () => {
    it('usa il numero WhatsApp ufficiale nel deep link', () => {
      const pub = toPublicService(RIGA_COMPLETA, NUMERO_UFFICIALE, 'it');
      expect(pub.whatsappUrl).toContain('https://wa.me/393514512070');
      // Il vecchio numero non deve comparire da nessuna parte.
      expect(pub.whatsappUrl).not.toContain('393921394070');
      expect(pub.whatsappUrl).not.toContain('393383963307');
    });

    it('il messaggio precompilato identifica il servizio', () => {
      const it = toPublicService(RIGA_COMPLETA, NUMERO_UFFICIALE, 'it');
      expect(decodeURIComponent(it.whatsappUrl)).toContain('Giro in gozzo — Giornata intera');

      const en = toPublicService(RIGA_COMPLETA, NUMERO_UFFICIALE, 'en');
      expect(decodeURIComponent(en.whatsappUrl)).toContain('Gozzo Boat Tour — Full Day');
      expect(decodeURIComponent(en.whatsappUrl)).toContain("I'm interested in");
    });

    it('sceglie la lingua giusta e ricade sull’inglese se manca l’italiano', () => {
      expect(toPublicService(RIGA_COMPLETA, NUMERO_UFFICIALE, 'en').title).toBe(
        'Gozzo Boat Tour — Full Day',
      );

      const senzaIt = { ...RIGA_COMPLETA, titleIt: null, descriptionIt: null };
      const pub = toPublicService(senzaIt, NUMERO_UFFICIALE, 'it');
      expect(pub.title).toBe('Gozzo Boat Tour — Full Day');
      expect(pub.description).toBe('Private tour with local skipper.');
    });

    it('“su richiesta” non espone alcun prezzo', () => {
      const suRichiesta = {
        ...RIGA_COMPLETA,
        slug: 'private-chef',
        priceOnRequest: true,
        salePriceEur: null,
        supplierCostEur: '70.00',
      };
      const pub = toPublicService(suRichiesta, NUMERO_UFFICIALE, 'it');

      expect(pub.priceEur).toBeNull();
      expect(pub.priceOnRequest).toBe(true);
      expect(JSON.stringify(pub)).not.toContain('70.00');
    });

    it('un prezzo di vendita presente ma con flag su richiesta non trapela', () => {
      // Dato incoerente in DB: il flag vince, il prezzo non esce.
      const incoerente = { ...RIGA_COMPLETA, priceOnRequest: true };
      expect(toPublicService(incoerente, NUMERO_UFFICIALE, 'it').priceEur).toBeNull();
    });
  });
});
