import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
  display: "swap",
});

// Metadati di sito allineati alla landing "missione" (04/08). Sono il
// default per ogni pagina: niente beta privata, niente posti limitati.
export const metadata: Metadata = {
  metadataBase: new URL("https://premura.it"),
  title: "Premura — Un host AI accanto a ogni ospite",
  description:
    "Un host AI accanto a ogni ospite, per tutto il soggiorno: ascolta, capisce, agisce — anche alle due di notte. Tu intervieni solo per le decisioni di soldi. Ogni messaggio si dichiara assistente AI.",
  openGraph: {
    title: "Premura — Un host AI accanto a ogni ospite",
    description:
      "Ascolta, capisce, agisce — anche alle due di notte. Tu approvi solo le decisioni di soldi.",
    type: "website",
    locale: "it_IT",
    siteName: "Premura",
  },
};

export const viewport: Viewport = {
  themeColor: "#1F3A4D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        {/* Skip link: primo elemento focalizzabile della pagina.
            Invisibile finche' non riceve il focus da tastiera, poi
            compare in alto a sinistra. Serve a chi naviga con Tab o
            con uno screen reader per saltare la navigazione e
            arrivare al contenuto. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-ink focus:px-4 focus:py-2 focus:text-body-sm focus:text-paper"
        >
          Salta al contenuto
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
