import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// Slice D — Layout dedicato per /c/* (PWA cleaner Karen).
// Manifest dichiarato qui. Tema cream + terracotta come slice 10a.

export const metadata: Metadata = {
  title: 'Premura Karen',
  description: 'App cleaner Premura: kit di benvenuto da preparare.',
  manifest: '/c/manifest.json',
  appleWebApp: {
    title: 'Premura Karen',
    capable: true,
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#c87f5a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function CleanerLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
