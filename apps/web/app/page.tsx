import { BetaAccessCTA } from '@/components/landing/BetaAccessCTA';
import { Footer } from '@/components/landing/Footer';
import { ForWhom } from '@/components/landing/ForWhom';
import { Hero } from '@/components/landing/Hero';
import { HowItDecides } from '@/components/landing/HowItDecides';
import { NeverList } from '@/components/landing/NeverList';
import { NightScene } from '@/components/landing/NightScene';
import { Pricing } from '@/components/landing/Pricing';
import { Problem } from '@/components/landing/Problem';
import { ProductShowcase } from '@/components/landing/ProductShowcase';
import type { Metadata } from 'next';

// Riscrittura 04/08, brief "missione": la pagina racconta cosa sara'
// Premura (host AI ombra), una cosa alla volta. Ordine dal brief:
// Hero -> Scena tappi -> Come decide -> Problema -> Dashboard in
// grande -> Cosa non fa mai -> Onesta' -> Prezzi -> Form (non piu'
// CTA primario). Vincolo AI Act art. 50: nessun copy che suggerisca
// che l'ospite ignori di parlare con un'AI.

export const metadata: Metadata = {
  title: 'Premura — Un host AI accanto a ogni ospite',
  description:
    'Premura ascolta gli ospiti per tutto il soggiorno, risponde alle due di notte e agisce da sola sotto soglia. Tu intervieni solo quando c’è una decisione di soldi. Ogni messaggio si dichiara assistente AI. Beta privata per host italiani con 1-5 strutture.',
  alternates: {
    canonical: 'https://premura.it',
  },
  openGraph: {
    title: 'Premura — Un host AI accanto a ogni ospite',
    description:
      'Ascolta, capisce, agisce — anche alle due di notte. Tu approvi solo le decisioni di soldi. Beta privata per host italiani con 1-5 strutture.',
    type: 'website',
    locale: 'it_IT',
    siteName: 'Premura',
    url: 'https://premura.it',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Premura — Un host AI accanto a ogni ospite',
    description:
      'Ascolta, capisce, agisce — anche alle due di notte. Tu approvi solo le decisioni di soldi.',
  },
};

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <NightScene />
        <HowItDecides />
        <Problem />
        <ProductShowcase />
        <NeverList />
        <ForWhom />
        <Pricing />
        <BetaAccessCTA />
      </main>
      <Footer />
    </>
  );
}
