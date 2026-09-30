import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Polices officielles YAZZ (Flutter) :
//   Outfit      → titres, headlines
//   Inter       → corps de texte, labels
//   Plus Jakarta Sans → police d'icônes/titres dans certaines vues Flutter
//   GoogleSansFlex   → police secondaire
//
// On charge Outfit + Inter via Google Fonts (rapidité de build), et on déclare
// les variables CSS pour usage Tailwind.

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Polices locales YAZZ (fallback, identiques au Flutter)
const plusJakarta = localFont({
  src: "../../public/fonts/PlusJakartaSans-Variable.ttf",
  variable: "--font-plus-jakarta",
  display: "swap",
});

const googleSans = localFont({
  src: "../../public/fonts/GoogleSansFlex-Variable.ttf",
  variable: "--font-google-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "YAZZ — Suivi GPS en temps réel",
  description:
    "YAZZ est la plateforme de suivi GPS temps réel pour véhicules en RDC. Sécurisez votre flotte, suivez vos trajets, recevez des alertes antivol instantanées.",
  keywords: [
    "YAZZ",
    "GPS",
    "suivi véhicule",
    "tracker GPS",
    "RDC",
    "Kinshasa",
    "flotte",
    "antivol",
  ],
  authors: [{ name: "YAZZ" }],
  icons: {
    icon: "/yazz-logo-square.png",
    apple: "/yazz-logo-square.png",
  },
  openGraph: {
    title: "YAZZ — Suivi GPS en temps réel",
    description:
      "Plateforme de suivi GPS temps réel pour véhicules en RDC.",
    siteName: "YAZZ",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "YAZZ — Suivi GPS en temps réel",
    description:
      "Plateforme de suivi GPS temps réel pour véhicules en RDC.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${inter.variable} ${plusJakarta.variable} ${googleSans.variable} font-sans antialiased bg-yazz-background text-yazz-text-dark`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
