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

export const metadata: Metadata = {
  title: "Premura — Il concierge per host italiani",
  description:
    "Premura è l'agente AI che si prende cura degli ospiti al posto tuo. Studia, scrive, intercetta i problemi prima che diventino recensioni. Per host di affitti brevi in Italia. In beta privata — entra nella waitlist.",
  openGraph: {
    title: "Premura — Il concierge per host italiani",
    description:
      "L'agente AI che si prende cura degli ospiti al posto tuo. Per host di affitti brevi in Italia.",
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
        {children}
        <Analytics />
      </body>
    </html>
  );
}
