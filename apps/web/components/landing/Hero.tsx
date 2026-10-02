import { GoogleCtaButton } from '@/components/landing/GoogleCtaButton';
import Link from 'next/link';

// Primo schermo (02/10): una scheda sola, sospesa. La missione resta
// nella riga sotto il nome. L'azione è l'ingresso vero, non un finto campo:
// Continua con Google, poi la casa si collega dentro.

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#07080c] px-5 pt-16 pb-24 text-[#f6f1ea] md:pt-24 md:pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 45% at 80% -10%, rgb(224 122 76 / 0.22), transparent 55%), radial-gradient(80% 40% at 50% 120%, rgb(40 70 110 / 0.35), transparent 60%)',
        }}
      />
      <div className="relative mx-auto max-w-xl" style={{ perspective: '1400px' }}>
        <p className="text-eyebrow font-semibold uppercase text-[#b7aea4]">Premura</p>
        <p className="mt-4 font-serif text-display leading-none">La tua casa</p>
        <p className="mt-3 max-w-md text-body-lg text-[#b7aea4]">
          Un minuto. Poi non apri più la chat.
        </p>

        <div
          className="mt-10 rounded-[28px] border border-white/15 p-6 shadow-[0_50px_80px_-36px_rgb(0_0_0/0.85)] md:p-8"
          style={{
            transform: 'rotateX(8deg)',
            background: 'linear-gradient(180deg, rgb(255 255 255 / 0.09), rgb(255 255 255 / 0.03))',
            boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.22), 0 50px 80px -36px rgb(0 0 0 / 0.85)',
          }}
        >
          <p className="text-eyebrow font-semibold uppercase text-terracotta">La casa</p>
          <h1 className="mt-2 font-serif text-h1 text-[#f6f1ea]">Mettila qui.</h1>
          <p className="mt-3 text-body text-[#b7aea4]">
            Un host AI accanto a ogni ospite, per tutto il soggiorno. Entri, e da quel momento le
            date le vede Premura.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <GoogleCtaButton href="/auth/google" />
            <Link
              href="/login"
              className="text-body-sm text-[#b7aea4] underline decoration-white/30 underline-offset-4 hover:text-[#f6f1ea]"
            >
              Sei già host Premura? Accedi
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
