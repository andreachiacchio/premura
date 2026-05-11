import { BetaAccessCTA } from '@/components/landing/BetaAccessCTA';
import { Footer } from '@/components/landing/Footer';
import { ForWhom } from '@/components/landing/ForWhom';
import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { InAction } from '@/components/landing/InAction';
import { Pricing } from '@/components/landing/Pricing';
import { Problem } from '@/components/landing/Problem';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Premura — Il concierge che non dorme mai per host indipendenti',
  description:
    "L'agente AI che si prende cura degli ospiti al posto tuo. Studia ogni prenotazione, scrive messaggi su misura, prepara un pensiero in casa e intercetta i problemi prima che diventino recensioni. Beta privata aperta a host italiani con 1-5 strutture.",
  alternates: {
    canonical: 'https://premura.it',
  },
  openGraph: {
    title: 'Premura — Il concierge che non dorme mai',
    description:
      'Per host italiani indipendenti con 1-5 strutture. Recensioni da 10 senza rinunciare al tempo. Beta privata aperta su richiesta.',
    type: 'website',
    locale: 'it_IT',
    siteName: 'Premura',
    url: 'https://premura.it',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Premura — Il concierge che non dorme mai',
    description: 'Per host italiani con 1-5 strutture. Beta privata su richiesta.',
  },
};

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <ForWhom />
        <InAction />
        <Pricing />
        <BetaAccessCTA />
      </main>
      <Footer />
    </>
  );
}
