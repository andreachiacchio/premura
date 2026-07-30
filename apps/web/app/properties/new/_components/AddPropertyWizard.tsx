'use client';

import type { ListingImportData } from '@premura/agents';
import { useRef, useState, useTransition } from 'react';
import {
  type GeocodeResult,
  createPropertyFromWizardAction,
  geocodeAddressAction,
  importListingAction,
  importListingFromUrlAction,
} from '../actions';

// Wizard "Aggiungi struttura". Primo passo: UN campo — il link
// dell'annuncio. Premura prova a leggerlo; se Booking/Airbnb bloccano
// (caso normale da datacenter) NIENTE errore: si propone il
// copia-incolla guidato. L'import precompila il form: l'host CORREGGE,
// non scrive. Un campo che l'import non trova resta vuoto.

type Step = 'link' | 'paste' | 'screenshots' | 'form';

const EMPTY: ListingImportData = {
  nome: null,
  citta: null,
  indirizzoIpotizzato: null,
  tipo: null,
  postiLetto: null,
  descrizione: null,
  dotazioni: [],
  regole: [],
  checkin: null,
  checkout: null,
  quartiere: null,
  lingua: null,
};

const INPUT_CLS =
  'h-12 rounded-card border border-line bg-paper px-4 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40';
const TEXTAREA_CLS =
  'rounded-card border border-line bg-paper px-4 py-3 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40';
const PRIMARY_BTN =
  'inline-flex h-12 items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2 active:translate-y-px disabled:cursor-wait disabled:opacity-60';
const GHOST_BTN =
  'inline-flex h-12 items-center justify-center rounded-full border border-line bg-paper px-6 text-body font-medium text-ink transition-colors hover:border-terracotta-soft';

function Field(props: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-body-sm font-medium text-ink-soft">{props.label}</span>
      <input
        type="text"
        name={props.name}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        required={props.required}
        className={INPUT_CLS}
      />
      {props.hint ? <span className="text-[12px] text-ink-mute">{props.hint}</span> : null}
    </label>
  );
}

export function AddPropertyWizard() {
  const [step, setStep] = useState<Step>('link');
  const [prefill, setPrefill] = useState<ListingImportData>(EMPTY);
  const [imported, setImported] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();
  const [listingUrl, setListingUrl] = useState('');
  // Il link non si apriva da qui: il passo 'paste' mostra la guida
  // Ctrl+A invece del suo testo standard.
  const [fromBlockedLink, setFromBlockedLink] = useState(false);

  const [addressDraft, setAddressDraft] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeocodeResult | null>(null);
  const [geocoding, startGeocode] = useTransition();
  const [creating, startCreate] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function runImport(formData: FormData) {
    setImportError(null);
    startImport(async () => {
      const result = await importListingAction(formData);
      if (result.ok) {
        setPrefill(result.data);
        setImported(true);
        setStep('form');
      } else {
        setImportError(result.error);
      }
    });
  }

  function handleCreate(formData: FormData) {
    startCreate(async () => {
      await createPropertyFromWizardAction(formData);
    });
  }

  function verifyAddress() {
    const query = [
      addressDraft ?? prefill.indirizzoIpotizzato ?? '',
      (formRef.current?.elements.namedItem('citta') as HTMLInputElement | null)?.value ?? '',
    ]
      .filter(Boolean)
      .join(', ');
    startGeocode(async () => {
      setGeo(await geocodeAddressAction(query));
    });
  }

  function tryLink() {
    setImportError(null);
    startImport(async () => {
      const result = await importListingFromUrlAction(listingUrl);
      if (result.ok) {
        setPrefill(result.data);
        setImported(true);
        setStep('form');
      } else if (result.blocked) {
        setFromBlockedLink(true);
        setStep('paste');
      } else {
        setImportError(result.error);
      }
    });
  }

  if (step === 'link') {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-[18px] font-semibold text-ink">Hai già l'annuncio online?</h2>
        <p className="text-body-sm text-ink-mute">
          Incolla il link del tuo annuncio Booking o Airbnb: provo a leggerlo e ti precompilo tutto.
          Tu controlli e correggi.
        </p>
        <input
          type="url"
          value={listingUrl}
          onChange={(e) => setListingUrl(e.target.value)}
          placeholder="https://www.booking.com/hotel/it/…"
          className={INPUT_CLS}
        />
        {importError ? <p className="text-body-sm text-terracotta-2">{importError}</p> : null}
        <button
          type="button"
          onClick={tryLink}
          disabled={importing || listingUrl.trim().length === 0}
          className={PRIMARY_BTN}
        >
          {importing ? 'Provo a leggerlo…' : "Leggi l'annuncio"}
        </button>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setFromBlockedLink(false);
              setStep('paste');
            }}
            className="text-body-sm text-ink-mute underline-offset-2 hover:underline"
          >
            Preferisco incollare il testo
          </button>
          <button
            type="button"
            onClick={() => setStep('screenshots')}
            className="text-body-sm text-ink-mute underline-offset-2 hover:underline"
          >
            Ho degli screenshot dell'annuncio
          </button>
          <button
            type="button"
            onClick={() => {
              setPrefill(EMPTY);
              setImported(false);
              setStep('form');
            }}
            className="text-body-sm text-ink-mute underline-offset-2 hover:underline"
          >
            Non ho un annuncio, parto da zero
          </button>
        </div>
      </div>
    );
  }

  if (step === 'paste') {
    return (
      <form action={runImport} className="flex flex-col gap-4">
        <h2 className="text-[18px] font-semibold text-ink">Incolla l'annuncio</h2>
        {fromBlockedLink ? (
          <p className="rounded-card border border-line bg-paper px-4 py-3 text-body-sm text-ink-soft">
            Non riesco ad aprire l'annuncio da qui — capita, Booking e Airbnb non aprono a tutti.
            Fai così: apri la pagina del tuo annuncio, seleziona tutto (Ctrl+A), copia e incolla qui
            sotto. Il risultato è identico.
          </p>
        ) : (
          <p className="text-body-sm text-ink-mute">
            Apri il tuo annuncio su Booking o Airbnb, seleziona tutto il testo (titolo, descrizione,
            servizi, regole) e incollalo qui.
          </p>
        )}
        <textarea
          name="listingText"
          rows={12}
          required
          placeholder="Titolo, descrizione, servizi, regole della casa…"
          className={TEXTAREA_CLS}
        />
        {importError ? <p className="text-body-sm text-terracotta-2">{importError}</p> : null}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={importing} className={PRIMARY_BTN}>
            {importing ? 'Leggo l’annuncio…' : 'Estrai i dati'}
          </button>
          <button type="button" onClick={() => setStep('link')} className={GHOST_BTN}>
            Indietro
          </button>
        </div>
      </form>
    );
  }

  if (step === 'screenshots') {
    return (
      <form action={runImport} className="flex flex-col gap-4">
        <h2 className="text-[18px] font-semibold text-ink">Carica gli screenshot</h2>
        <p className="text-body-sm text-ink-mute">
          2-3 schermate dell'annuncio: titolo e descrizione, servizi, regole. Massimo 5 MB l'una. Le
          foto della casa le caricherai dopo, dalla pagina della struttura.
        </p>
        <input
          type="file"
          name="screenshots"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required
          className="text-body-sm text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-line file:px-4 file:py-2 file:text-body-sm file:font-medium file:text-ink"
        />
        {importError ? <p className="text-body-sm text-terracotta-2">{importError}</p> : null}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={importing} className={PRIMARY_BTN}>
            {importing ? 'Leggo gli screenshot…' : 'Estrai i dati'}
          </button>
          <button type="button" onClick={() => setStep('link')} className={GHOST_BTN}>
            Indietro
          </button>
        </div>
      </form>
    );
  }

  return (
    <form ref={formRef} action={handleCreate} className="flex flex-col gap-5">
      {imported ? (
        <p className="rounded-card border border-line bg-paper px-4 py-3 text-body-sm text-ink-soft">
          Ho precompilato quello che ho letto nell'annuncio. I campi vuoti non c'erano: completali
          tu se servono. Controlla e correggi prima di salvare.
        </p>
      ) : null}

      <Field label="Nome della struttura" name="nome" defaultValue={prefill.nome ?? ''} required />
      <Field label="Città" name="citta" defaultValue={prefill.citta ?? ''} required />

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink-soft">Indirizzo</span>
          <input
            type="text"
            name="indirizzo"
            defaultValue={prefill.indirizzoIpotizzato ?? ''}
            onChange={(e) => {
              setAddressDraft(e.target.value);
              setGeo(null);
            }}
            placeholder="Via, numero civico"
            className={INPUT_CLS}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={verifyAddress}
            disabled={geocoding}
            className="text-body-sm font-medium text-terracotta-2 underline-offset-2 hover:underline disabled:opacity-60"
          >
            {geocoding ? 'Verifico…' : 'Verifica indirizzo sulla mappa'}
          </button>
        </div>
        {geo?.ok ? (
          <p className="text-body-sm text-ink-soft">
            📍 Trovato: {geo.displayName}
            <input type="hidden" name="latitude" value={geo.latitude} />
            <input type="hidden" name="longitude" value={geo.longitude} />
          </p>
        ) : null}
        {geo && !geo.ok ? <p className="text-body-sm text-terracotta-2">{geo.error}</p> : null}
        {!geo ? (
          <p className="text-[12px] text-ink-mute">
            La posizione serve per la mappa e i consigli di zona nella guest app.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Tipo"
          name="tipo"
          defaultValue={prefill.tipo ?? ''}
          placeholder="appartamento"
        />
        <Field
          label="Posti letto"
          name="postiLetto"
          defaultValue={prefill.postiLetto != null ? String(prefill.postiLetto) : ''}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Check-in"
          name="checkin"
          defaultValue={prefill.checkin ?? ''}
          placeholder="15:00-20:00"
        />
        <Field
          label="Check-out"
          name="checkout"
          defaultValue={prefill.checkout ?? ''}
          placeholder="entro le 10:00"
        />
      </div>

      <Field label="Quartiere / zona" name="quartiere" defaultValue={prefill.quartiere ?? ''} />

      <label className="flex flex-col gap-2">
        <span className="text-body-sm font-medium text-ink-soft">Descrizione</span>
        <textarea
          name="descrizione"
          rows={5}
          defaultValue={prefill.descrizione ?? ''}
          className={TEXTAREA_CLS}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-body-sm font-medium text-ink-soft">Dotazioni (una per riga)</span>
        <textarea
          name="dotazioni"
          rows={4}
          defaultValue={prefill.dotazioni.join('\n')}
          className={TEXTAREA_CLS}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-body-sm font-medium text-ink-soft">
          Regole della casa (una per riga)
        </span>
        <textarea
          name="regole"
          rows={3}
          defaultValue={prefill.regole.join('\n')}
          className={TEXTAREA_CLS}
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Codice annuncio Booking"
          name="bookingListingId"
          defaultValue=""
          placeholder="es. 10194397"
          hint="Lo trovi nell'extranet Booking. Tiene agganciata la struttura al suo annuncio."
        />
        <Field
          label="Lingua dell'annuncio"
          name="lingua"
          defaultValue={prefill.lingua ?? ''}
          placeholder="it"
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={creating} className={PRIMARY_BTN}>
          {creating ? 'Creo la struttura…' : 'Crea la struttura'}
        </button>
        <button type="button" onClick={() => setStep('link')} className={GHOST_BTN}>
          Indietro
        </button>
      </div>
      <p className="text-body-sm text-ink-mute">
        Dopo il salvataggio colleghi i calendari (Booking, Airbnb) e le prenotazioni arrivano da
        sole.
      </p>
    </form>
  );
}
