import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { findByHostId } from '@/lib/repositories/properties';
import { getPropertyKnowledge, isPropertyOwnedByHost } from '@/lib/repositories/property-knowledge';
import { notFound } from 'next/navigation';
import { AiAssistantModal } from './_components/AiAssistantModal';
import { HousePhotosEditor } from './_components/HousePhotosEditor';
import { LocalTipsEditor } from './_components/LocalTipsEditor';
import {
  saveAdditionalInfoAction,
  saveCheckInOutInstructionsAction,
  saveHouseRulesAction,
  saveKeyboxAction,
  saveKitDefaultPlacementAction,
  saveGuestAppUrlAction,
  saveLanguageDefaultAction,
  saveParkingAction,
  saveWifiAction,
} from './actions';

export const dynamic = 'force-dynamic';

// Slice 12 — Pagina property knowledge.
//
// Form unico con sezioni collassabili (HTML5 details/summary).
// Auto-save on submit di sezione (action server-side, no JS lato client
// nello scaffold base — refinement con onBlur fetch arriva in slice
// futuro).
//
// Pre-check ownership: la property deve appartenere all'host
// corrente. Altrimenti 404.

export default async function PropertyKnowledgePage(props: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await props.params;
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const ownership = await isPropertyOwnedByHost(db, propertyId, hostId);
  if (!ownership) notFound();

  const props_ = await findByHostId({ db, hostId });
  const property = props_.find((p) => p.id === propertyId);
  if (!property) notFound();

  const knowledge = await getPropertyKnowledge(db, propertyId);

  const saveKeybox = saveKeyboxAction.bind(null, propertyId);
  const saveWifi = saveWifiAction.bind(null, propertyId);
  const saveParking = saveParkingAction.bind(null, propertyId);
  const saveHouseRules = saveHouseRulesAction.bind(null, propertyId);
  const saveAdditionalInfo = saveAdditionalInfoAction.bind(null, propertyId);
  const saveCheckInOut = saveCheckInOutInstructionsAction.bind(null, propertyId);
  const savePlacement = saveKitDefaultPlacementAction.bind(null, propertyId);
  const saveLanguage = saveLanguageDefaultAction.bind(null, propertyId);
  const saveGuestAppUrl = saveGuestAppUrlAction.bind(null, propertyId);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl bg-ivory px-5 pt-12 pb-16">
      <header className="mb-8">
        <p className="text-eyebrow uppercase text-ink-mute">Manuale digitale</p>
        <h1 className="mt-2 font-serif text-h1 leading-[1.05] tracking-tight text-ink">
          {property.name}
        </h1>
        <p className="mt-3 text-body-lg text-ink-soft">
          Compila quello che vuoi, quando vuoi. Tutto si salva da solo. Useremo questi dati per
          rispondere agli ospiti senza svegliarti ogni volta.
        </p>
        <div className="mt-4">
          <AiAssistantModal propertyId={propertyId} />
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <Section title="Codice keybox e ingresso" defaultOpen>
          <form action={saveKeybox} className="flex flex-col gap-3">
            <FieldLabel>
              Codice keybox
              <input
                type="text"
                name="code"
                defaultValue={knowledge?.keybox?.code ?? ''}
                maxLength={64}
                placeholder="1234"
                className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <FieldLabel>
              Istruzioni per trovarlo
              <textarea
                name="instructions"
                defaultValue={knowledge?.keybox?.instructions ?? ''}
                maxLength={2000}
                rows={3}
                placeholder="Sopra al campanello, lato sinistro del portone."
                className="rounded-card border border-line bg-paper px-3 py-2 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <SaveButton />
          </form>
        </Section>

        <Section title="WiFi">
          <form action={saveWifi} className="flex flex-col gap-3">
            <FieldLabel>
              Nome rete (SSID)
              <input
                type="text"
                name="ssid"
                defaultValue={knowledge?.wifi?.ssid ?? ''}
                maxLength={64}
                className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <FieldLabel>
              Password
              <input
                type="text"
                name="password"
                defaultValue={knowledge?.wifi?.password ?? ''}
                maxLength={64}
                className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <FieldLabel>
              Note (es. router posizione, problemi noti)
              <textarea
                name="notes"
                defaultValue={knowledge?.wifi?.notes ?? ''}
                maxLength={500}
                rows={2}
                className="rounded-card border border-line bg-paper px-3 py-2 text-body text-ink focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <SaveButton />
          </form>
        </Section>

        <Section title="Parcheggio">
          <form action={saveParking} className="flex flex-col gap-3">
            <FieldLabel>
              Tipo
              <select
                name="type"
                defaultValue={knowledge?.parking?.type ?? ''}
                className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
              >
                <option value="">— scegli —</option>
                <option value="street">Strada (gratuito)</option>
                <option value="paid">Strada (a pagamento, blu)</option>
                <option value="garage">Garage convenzionato</option>
                <option value="private">Privato</option>
                <option value="none">Nessuno disponibile</option>
              </select>
            </FieldLabel>
            <FieldLabel>
              Istruzioni
              <textarea
                name="instructions"
                defaultValue={knowledge?.parking?.instructions ?? ''}
                maxLength={2000}
                rows={3}
                placeholder="Cerca posto in via Roma. Dopo le 20 e' tutto libero."
                className="rounded-card border border-line bg-paper px-3 py-2 text-body text-ink focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <SaveButton />
          </form>
        </Section>

        <Section title="Regole della casa">
          <form action={saveHouseRules} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <FieldLabel>
                Silenzio dalle
                <input
                  type="time"
                  name="quietHoursStart"
                  defaultValue={knowledge?.houseRules?.quietHoursStart ?? ''}
                  className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
                />
              </FieldLabel>
              <FieldLabel>
                alle
                <input
                  type="time"
                  name="quietHoursEnd"
                  defaultValue={knowledge?.houseRules?.quietHoursEnd ?? ''}
                  className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
                />
              </FieldLabel>
            </div>
            <label className="flex items-center gap-3 rounded-card border border-line bg-paper px-3 py-2.5">
              <input
                type="checkbox"
                name="smokingAllowed"
                defaultChecked={knowledge?.houseRules?.smokingAllowed ?? false}
                className="size-4 accent-terracotta"
              />
              <span className="text-body text-ink">Si puo' fumare</span>
            </label>
            <label className="flex items-center gap-3 rounded-card border border-line bg-paper px-3 py-2.5">
              <input
                type="checkbox"
                name="petsAllowed"
                defaultChecked={knowledge?.houseRules?.petsAllowed ?? false}
                className="size-4 accent-terracotta"
              />
              <span className="text-body text-ink">Animali domestici ok</span>
            </label>
            <FieldLabel>
              Note aggiuntive
              <textarea
                name="additionalNotes"
                defaultValue={knowledge?.houseRules?.additionalNotes ?? ''}
                maxLength={2000}
                rows={3}
                className="rounded-card border border-line bg-paper px-3 py-2 text-body text-ink focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <SaveButton />
          </form>
        </Section>

        <Section title="Check-in / Check-out">
          <form action={saveCheckInOut} className="flex flex-col gap-3">
            <FieldLabel>
              Istruzioni check-in
              <textarea
                name="checkInInstructions"
                defaultValue={knowledge?.checkInInstructions ?? ''}
                maxLength={2000}
                rows={3}
                placeholder="Es. Citofono &laquo;La Goccia&raquo;. Dopo le 22 chiamare il numero di emergenza."
                className="rounded-card border border-line bg-paper px-3 py-2 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <FieldLabel>
              Istruzioni check-out
              <textarea
                name="checkOutInstructions"
                defaultValue={knowledge?.checkOutInstructions ?? ''}
                maxLength={2000}
                rows={3}
                placeholder="Es. Lasciare le chiavi sul tavolo, chiudere finestre."
                className="rounded-card border border-line bg-paper px-3 py-2 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <SaveButton />
          </form>
        </Section>

        <Section title="Contatti d'emergenza">
          <p className="text-body-sm text-ink-soft">
            Idraulico, elettricista, vicino di fiducia. Useremo questi contatti solo in caso di
            problema reale segnalato dall'ospite.
          </p>
          <p className="mt-2 text-body-sm text-ink-mute">
            Form contatti gestito separatamente (slice 12.1: lista dinamica). Per ora compila in
            &laquo;Note libere&raquo;.
          </p>
        </Section>

        <Section title="Posti curati nelle vicinanze">
          <LocalTipsEditor
            propertyId={propertyId}
            initial={knowledge?.localTipsCuratedHost ?? []}
          />
        </Section>

        <Section title="Link della guida ospite">
          <form action={saveGuestAppUrl} className="flex flex-col gap-3">
            <FieldLabel>
              Indirizzo della guida di QUESTA casa
              <input
                type="url"
                name="guestAppUrl"
                defaultValue={property?.guestAppUrl ?? ''}
                maxLength={500}
                placeholder="https://..."
                className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <p className="text-body-sm text-ink-soft">
              È il link che l&apos;ospite riceve con l&apos;invito. Se resta vuoto l&apos;invito
              non parte: meglio un messaggio che manca di uno che manda alla casa sbagliata.
            </p>
            <SaveButton />
          </form>
        </Section>

        <Section title="Setup omaggio">
          <form action={savePlacement} className="flex flex-col gap-3">
            <FieldLabel>
              Dove la cleaner deve lasciare il kit
              <input
                type="text"
                name="kitDefaultPlacement"
                defaultValue={knowledge?.kitDefaultPlacement ?? ''}
                maxLength={200}
                placeholder="Es. tavolo cucina (default), comodino camera matrimoniale"
                className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none"
              />
            </FieldLabel>
            <p className="text-body-sm text-ink-mute">
              Se vuoto, il default è &laquo;tavolo cucina&raquo;.
            </p>
            <SaveButton />
          </form>
        </Section>

        <Section title="Foto della casa">
          <HousePhotosEditor propertyId={propertyId} initial={knowledge?.housePhotos ?? []} />
        </Section>

        <Section title="Lingua default">
          <form action={saveLanguage} className="flex flex-col gap-3">
            <FieldLabel>
              Lingua di default per messaggi welcome / storytelling kit
              <select
                name="languageDefault"
                defaultValue={knowledge?.languageDefault ?? 'it'}
                className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
              >
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </FieldLabel>
            <SaveButton />
          </form>
        </Section>

        <Section title="Note libere">
          <form action={saveAdditionalInfo} className="flex flex-col gap-3">
            <textarea
              name="additionalInfo"
              defaultValue={knowledge?.additionalInfo ?? ''}
              maxLength={5000}
              rows={6}
              placeholder="Tutto quello che non rientra altrove. Caratteristiche speciali, segreti del quartiere, contatti vari."
              className="rounded-card border border-line bg-paper px-3 py-2 text-body text-ink focus:border-terracotta-soft focus:outline-none"
            />
            <SaveButton />
          </form>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-card border border-line bg-paper/60 px-4 py-3 [&[open]>summary]:mb-3"
    >
      <summary className="cursor-pointer list-none text-body font-medium text-ink hover:text-terracotta-2 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="text-ink-mute">
            +
          </span>
          {title}
        </span>
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

// Wrapper visivo per gruppo label+input. Children include sempre
// sia il testo che l'input target, valido HTML5 ma il linter non
// lo riconosce strutturalmente.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input nested in children
    <label className="flex flex-col gap-1.5 text-body-sm font-medium text-ink-soft">
      {children}
    </label>
  );
}

function SaveButton() {
  return (
    <button
      type="submit"
      className="self-start inline-flex h-10 items-center justify-center rounded-full bg-terracotta px-5 text-body-sm font-medium text-paper shadow-sm transition-colors hover:bg-terracotta-2"
    >
      Salva sezione
    </button>
  );
}
