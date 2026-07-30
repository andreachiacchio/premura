// Regola unica per le date brevi della dashboard (bug produzione 30/07):
// "18 mar" senza anno sembra passato quando e' il 2027. L'anno compare
// solo quando NON e' l'anno corrente — il rumore si paga solo quando
// l'informazione serve. Stessa regola per home e check-in: due schermate
// che mostrano la stessa prenotazione non devono poterla datare diversamente.

const DAY_MONTH = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDayMonth(date: Date, now: Date = new Date()): string {
  return date.getFullYear() === now.getFullYear()
    ? DAY_MONTH.format(date)
    : DAY_MONTH_YEAR.format(date);
}

const WEEKDAY_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'long' });

/**
 * Giorno in linguaggio host: "oggi" / "domani" / "sabato" (entro 6
 * giorni) / "il 12 ago". Stessa voce in home e check-in — due schermate
 * non devono datare lo stesso evento in modi diversi.
 */
export function dayPhrase(dateIso: string | Date, now: Date): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const date = new Date(dateIso);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays <= 0) return 'oggi';
  if (diffDays === 1) return 'domani';
  if (diffDays <= 6) return WEEKDAY_FMT.format(date);
  return `il ${formatDayMonth(date, now)}`;
}
