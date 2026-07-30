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
