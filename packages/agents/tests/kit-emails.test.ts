import { describe, expect, it } from 'vitest';
import type { KitNotificationContext } from '../src/kit-generator/cleaner-brief';
import { renderTemplate } from '../src/kit-generator/kit-emails';

// Slice C — Test render template email founder (pure, no Resend).

const baseCtx: KitNotificationContext = {
  kitId: 'kit-uuid-1',
  bookingId: 'booking-uuid-1',
  hostId: 'host-uuid-1',
  hostFullName: 'Andrea Chiacchio',
  hostEmail: 'andrea@premura.it',
  guestFullName: 'Lena Mueller',
  propertyName: 'La Goccia',
  checkinAt: new Date('2026-05-15T14:30:00Z'),
  nights: 3,
  budgetTargetEur: '15.00',
  itemsTotalEur: '12.50',
  storyteller: 'Coppia tedesca anniversario, prima volta Napoli',
  status: 'proposed',
};

const baseUrl = 'https://premura.it';

describe('renderTemplate kit_proposed', () => {
  it('subject include emoji + guest + property', () => {
    const t = renderTemplate('kit_proposed', baseCtx, baseUrl, null);
    expect(t.subject).toContain('🎁');
    expect(t.subject).toContain('Lena Mueller');
    expect(t.subject).toContain('La Goccia');
    expect(t.subject).toContain('approvazione');
  });

  it('body include greeting + dati + link approva', () => {
    const t = renderTemplate('kit_proposed', baseCtx, baseUrl, null);
    expect(t.html).toContain('Andrea Chiacchio');
    expect(t.html).toContain('Lena Mueller');
    expect(t.html).toContain('La Goccia');
    expect(t.html).toContain(`${baseUrl}/dashboard/kits/kit-uuid-1`);
    expect(t.html).toContain('Vai alla dashboard');
    expect(t.html).toContain('€12.50');
  });

  it('escapa HTML in guest name (XSS guard)', () => {
    const malicious = renderTemplate(
      'kit_proposed',
      { ...baseCtx, guestFullName: '<script>x</script>' },
      baseUrl,
      null,
    );
    expect(malicious.html).not.toContain('<script>');
    expect(malicious.html).toContain('&lt;script&gt;');
  });
});

describe('renderTemplate kit_approved', () => {
  it('subject include checkmark + guest', () => {
    const t = renderTemplate('kit_approved', baseCtx, baseUrl, null);
    expect(t.subject).toContain('✅');
    expect(t.subject).toContain('Lena Mueller');
  });

  it('body link a /execute', () => {
    const t = renderTemplate('kit_approved', baseCtx, baseUrl, null);
    expect(t.html).toContain(`${baseUrl}/dashboard/kits/kit-uuid-1/execute`);
  });
});

describe('renderTemplate cleaner_confirmed', () => {
  it('subject include 👍 + guest', () => {
    const t = renderTemplate('cleaner_confirmed', baseCtx, baseUrl, null);
    expect(t.subject).toContain('👍');
    expect(t.subject).toContain('Karen ha confermato');
    expect(t.subject).toContain('Lena Mueller');
  });

  it('body link al kit detail', () => {
    const t = renderTemplate('cleaner_confirmed', baseCtx, baseUrl, null);
    expect(t.html).toContain(`${baseUrl}/dashboard/kits/kit-uuid-1`);
  });
});

describe('renderTemplate cleaner_uploaded_photo', () => {
  it('subject include 📸 + guest', () => {
    const t = renderTemplate('cleaner_uploaded_photo', baseCtx, baseUrl, null);
    expect(t.subject).toContain('📸');
    expect(t.subject).toContain('Foto setup pronta');
  });

  it('body include img tag se photoUrl fornito', () => {
    const t = renderTemplate(
      'cleaner_uploaded_photo',
      baseCtx,
      baseUrl,
      'https://cdn.example/photo.jpg',
    );
    expect(t.html).toContain('<img src="https://cdn.example/photo.jpg"');
  });

  it('body include placeholder se photoUrl null', () => {
    const t = renderTemplate('cleaner_uploaded_photo', baseCtx, baseUrl, null);
    expect(t.html).toContain('foto allegata');
    expect(t.html).not.toContain('<img');
  });
});
