import { describe, expect, it } from 'vitest';
import { htmlToText } from '../lib/listing-page';

// L'import da link vive o muore sulla qualita' del testo estratto:
// script e stili non devono finire nel prompt, il contenuto si'.

describe('htmlToText', () => {
  it('estrae il testo, scarta script e stili', () => {
    const html = `<html><head><style>.x{color:red}</style>
      <script>var tracking = "junk";</script></head>
      <body><h1>La Goccia di San Gennaro</h1>
      <p>Jacuzzi &amp; aria condizionata nel Centro Storico</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain('La Goccia di San Gennaro');
    expect(text).toContain('Jacuzzi & aria condizionata');
    expect(text).not.toContain('tracking');
    expect(text).not.toContain('color:red');
  });

  it('decodifica le entita e normalizza gli spazi', () => {
    expect(htmlToText('Check-in&nbsp;dalle&nbsp;15:00   <br/>  ok')).toBe(
      'Check-in dalle 15:00 ok',
    );
  });
});
