'use client';

import {
  Building2,
  CalendarDays,
  Gift,
  Home,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Navigazione della dashboard.
//
// Tre forme, stesse voci, stesse route:
//  - sotto 768px: barra in basso, dove sta il pollice
//  - fra 768 e 1024: barra compatta in alto
//  - da 1024: colonna laterale di 220px
//
// Cinque voci al massimo in basso, perche' la sesta rende ogni bersaglio
// troppo stretto per un dito: le altre stanno dietro "Altro".
//
// I nomi sono quelli decisi il 06/08 e non si toccano: "Conversazioni"
// resta "Conversazioni" — e' gia' linguaggio da host e descrive l'unita'
// su cui Premura lavora.

type NavItem = {
  href: string;
  label: string;
  Icon: typeof Home;
};

const PRIMARY: NavItem[] = [
  { href: '/dashboard', label: 'Oggi', Icon: Home },
  { href: '/dashboard/conversations', label: 'Conversazioni', Icon: MessageSquare },
  { href: '/dashboard/upcoming-checkins', label: 'Chi arriva', Icon: CalendarDays },
  { href: '/dashboard/kits', label: 'Kit', Icon: Gift },
];

const SECONDARY: NavItem[] = [
  { href: '/dashboard/cleaners', label: 'Squadra', Icon: Users },
  { href: '/properties', label: 'Strutture', Icon: Building2 },
  { href: '/dashboard/settings', label: 'Impostazioni', Icon: Settings },
];

/** "Oggi" e' attiva solo sulla home esatta: ogni sotto-rotta ha la sua voce. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * @param decisionsCount Badge su "Oggi". Si mostra SOLO se > 0: un
 *   pallino a zero e' rumore che insegna a ignorare i pallini.
 */
export function DashboardNav({ decisionsCount }: { decisionsCount: number }): React.JSX.Element {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Lo sheet si chiude quando si cambia pagina: restare aperto sopra la
  // pagina nuova sembra un blocco.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la chiusura dipende dal cambio rotta
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const badge =
    decisionsCount > 0 ? (
      <span
        aria-hidden
        className="absolute -right-2 -top-1 grid min-w-[18px] place-items-center rounded-full bg-terracotta px-1 text-[11px] font-semibold leading-[18px] text-paper"
      >
        {decisionsCount}
      </span>
    ) : null;

  const srBadge = decisionsCount > 0 ? ` — ${decisionsCount} in attesa di te` : '';

  return (
    <>
      {/* ─── Da 1024px: colonna laterale ───────────────────────────── */}
      <nav
        aria-label="Sezioni"
        className="fixed inset-y-0 left-0 hidden w-[220px] flex-col gap-1 border-r border-line-soft bg-paper px-3 py-6 lg:flex"
      >
        <span className="mb-4 px-3 font-serif text-h4 text-ink">Premura</span>
        {[...PRIMARY, ...SECONDARY].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? 'page' : undefined}
            className={`relative flex min-h-[44px] items-center gap-3 rounded-card px-3 text-body font-medium transition-colors ${
              isActive(pathname, href)
                ? 'bg-line-soft text-ink'
                : 'text-ink-soft hover:bg-line-soft hover:text-ink'
            }`}
          >
            <Icon aria-hidden className="size-[20px] shrink-0" />
            <span className="relative">
              {label}
              {href === '/dashboard' ? badge : null}
            </span>
            {href === '/dashboard' && decisionsCount > 0 ? (
              <span className="sr-only">{srBadge}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {/* ─── Fra 768 e 1024: barra compatta in alto ────────────────── */}
      <nav
        aria-label="Sezioni"
        className="sticky top-0 z-30 hidden items-center gap-1 border-b border-line-soft bg-paper px-4 md:flex lg:hidden"
      >
        {[...PRIMARY, ...SECONDARY].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? 'page' : undefined}
            className={`relative flex min-h-[44px] items-center px-3 text-body-sm font-medium transition-colors ${
              isActive(pathname, href)
                ? 'border-b-2 border-terracotta text-ink'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <span className="relative">
              {label}
              {href === '/dashboard' ? badge : null}
            </span>
          </Link>
        ))}
      </nav>

      {/* ─── Sotto 768px: barra in basso ───────────────────────────── */}
      <nav
        aria-label="Sezioni"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex items-stretch justify-around">
          {PRIMARY.map(({ href, label, Icon }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 ${
                  isActive(pathname, href) ? 'text-terracotta-2' : 'text-ink-mute'
                }`}
              >
                <span className="relative">
                  <Icon aria-hidden className="size-6" />
                  {href === '/dashboard' ? badge : null}
                </span>
                <span className="text-[11px] leading-none">{label}</span>
                {href === '/dashboard' && decisionsCount > 0 ? (
                  <span className="sr-only">{srBadge}</span>
                ) : null}
              </Link>
            </li>
          ))}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-expanded={sheetOpen}
              aria-haspopup="dialog"
              className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 py-2 ${
                SECONDARY.some((s) => isActive(pathname, s.href))
                  ? 'text-terracotta-2'
                  : 'text-ink-mute'
              }`}
            >
              <MoreHorizontal aria-hidden className="size-6" />
              <span className="text-[11px] leading-none">Altro</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* ─── Sheet "Altro" ─────────────────────────────────────────── */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Chiudi"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-ink/30"
          />
          <div
            role="dialog"
            aria-label="Altre sezioni"
            className="absolute inset-x-0 bottom-0 rounded-t-[20px] border-t border-line-soft bg-paper pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-serif text-h4 text-ink">Altro</span>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Chiudi"
                className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-line-soft"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <ul className="pb-2">
              {SECONDARY.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex min-h-[52px] items-center gap-3 border-t border-line-soft px-5 text-body text-ink"
                  >
                    <Icon aria-hidden className="size-5 text-ink-mute" />
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                {/* Esci passa dal form di logout: e' una POST, non un link. */}
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="flex min-h-[52px] w-full items-center gap-3 border-t border-line-soft px-5 text-left text-body text-ink"
                  >
                    <LogOut aria-hidden className="size-5 text-ink-mute" />
                    Esci
                  </button>
                </form>
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
