import { describe, expect, it } from 'vitest';
import { buildGuestInviteEmail } from '../src/guest-invite-email';

const BASE = {
  guestFirstName: 'Stephen',
  propertyName: 'Villa Cristina',
  checkinAt: new Date('2026-08-14T14:00:00Z'),
  checkoutAt: new Date('2026-08-18T10:00:00Z'),
  guestAppUrl: 'https://premura.it/g/abc.def.ghi',
  hostFirstName: 'Andrea',
};

describe('email di invito alla piattaforma ospite', () => {
  describe('contenuto', () => {
    it('contiene il link alla pagina ospite, in HTML e in testo', () => {
      const mail = buildGuestInviteEmail(BASE);
      expect(mail.html).toContain('https://premura.it/g/abc.def.ghi');
      expect(mail.text).toContain('https://premura.it/g/abc.def.ghi');
    });

    it('saluta per nome e nomina la struttura nell’oggetto', () => {
      const mail = buildGuestInviteEmail(BASE);
      expect(mail.text).toContain('Stephen');
      expect(mail.subject).toContain('Villa Cristina');
    });

    it('funziona anche senza nome ospite e senza nome host', () => {
      const mail = buildGuestInviteEmail({
        ...BASE,
        guestFirstName: null,
        hostFirstName: null,
      });
      expect(mail.text.startsWith('Hi,')).toBe(true);
      expect(mail.text).not.toContain('null');
      expect(mail.text).not.toContain('undefined');
    });

    it('mostra le date del soggiorno', () => {
      const mail = buildGuestInviteEmail({ ...BASE, language: 'it' });
      expect(mail.text).toContain('14 agosto 2026');
      expect(mail.text).toContain('18 agosto 2026');
    });

    it('invita a scrivere su WhatsApp: è il gesto che apre la finestra 24h', () => {
      // Il senso dell'email è questo. Se un giorno sparisse, il percorso
      // email → app → WhatsApp si spezzerebbe e l'agente resterebbe muto.
      expect(buildGuestInviteEmail(BASE).text.toLowerCase()).toContain('whatsapp');
      expect(buildGuestInviteEmail({ ...BASE, language: 'it' }).text.toLowerCase()).toContain(
        'whatsapp',
      );
    });
  });

  describe('lingua', () => {
    it('italiano quando la lingua ospite è italiana', () => {
      const mail = buildGuestInviteEmail({ ...BASE, language: 'it-IT' });
      expect(mail.language).toBe('it');
      expect(mail.text).toContain('Ciao Stephen');
      expect(mail.subject).toContain('Il tuo soggiorno');
    });

    it('inglese come default per qualunque altra lingua', () => {
      for (const lang of ['en', 'en-GB', 'de', 'fr', null, undefined, '']) {
        const mail = buildGuestInviteEmail({ ...BASE, language: lang });
        expect(mail.language).toBe('en');
        expect(mail.subject).toContain('Your stay');
      }
    });
  });

  describe('sicurezza del contenuto', () => {
    it('NON contiene codici d’accesso: l’email resta nella casella per sempre', () => {
      // I codici vivono nell'app, dove la visibilità è legata alle date
      // del soggiorno. In un'email inoltrabile sarebbero permanenti.
      const mail = buildGuestInviteEmail(BASE);
      const corpo = `${mail.text} ${mail.html}`.toLowerCase();
      for (const parola of ['password', 'keybox', 'codice della porta', 'door code']) {
        expect(corpo).not.toContain(parola);
      }
    });

    it('fa escape dell’HTML nei nomi: arrivano da terzi', () => {
      const mail = buildGuestInviteEmail({
        ...BASE,
        guestFirstName: '<script>alert(1)</script>',
        propertyName: 'Villa "Cristina" & Co',
      });
      expect(mail.html).not.toContain('<script>');
      expect(mail.html).toContain('&lt;script&gt;');
      expect(mail.html).toContain('&quot;Cristina&quot;');
      expect(mail.html).toContain('&amp;');
    });

    it('fa escape anche dell’URL nell’attributo href', () => {
      const mail = buildGuestInviteEmail({
        ...BASE,
        guestAppUrl: 'https://premura.it/g/tok"onmouseover="alert(1)',
      });
      expect(mail.html).not.toContain('"onmouseover="');
      expect(mail.html).toContain('&quot;onmouseover=');
    });
  });

  describe('struttura HTML', () => {
    it('è un documento completo con un solo pulsante di azione', () => {
      const mail = buildGuestInviteEmail(BASE);
      expect(mail.html).toContain('<!doctype html>');
      expect((mail.html.match(/<a href=/g) ?? []).length).toBe(1);
    });

    it('la versione testo non contiene tag HTML', () => {
      expect(buildGuestInviteEmail(BASE).text).not.toMatch(/<[a-z]+[\s>]/i);
    });
  });
});
