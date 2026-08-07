import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// Ritorno indietro.
//
// 07/08: stava in alto A DESTRA, grigio chiaro, cliccabile solo sul
// testo. Tre problemi in uno: e' il lato dove l'occhio non arriva
// leggendo, e' l'angolo che il pollice non raggiunge su un telefono, ed
// era un bersaglio alto quindici pixel.
//
// Ora sta a SINISTRA sopra il titolo — la convenzione di ogni app, e il
// punto in cui lo sguardo torna quando cerca l'uscita. Bersaglio da
// 44px, freccia vera invece del carattere "←", contrasto da testo che
// si deve leggere e non da metadato.

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-card px-2 text-body font-medium text-ink-soft transition-colors hover:bg-line-soft hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-5 shrink-0" />
      {children}
    </Link>
  );
}

export default BackLink;
