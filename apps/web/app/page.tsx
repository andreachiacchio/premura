import { LiveLanding } from '@/components/landing/LiveLanding';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Premura — Un host AI accanto a ogni ospite',
  description:
    'Accanto a ogni ospite, per tutto il soggiorno. Entri con Google, metti la casa, Premura risponde di notte. Tu dici sì solo se ci sono dei soldi.',
  alternates: {
    canonical: 'https://premura.it',
  },
  openGraph: {
    title: 'Premura — Accanto a ogni ospite',
    description: 'Anche alle due di notte. Tu dici sì solo se ci sono dei soldi.',
    type: 'website',
    locale: 'it_IT',
    siteName: 'Premura',
    url: 'https://premura.it',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Premura — Accanto a ogni ospite',
    description: 'Anche alle due di notte. Tu dici sì solo se ci sono dei soldi.',
  },
};

export default function Home() {
  return (
    <div id="main-content">
      <LiveLanding />
    </div>
  );
}
