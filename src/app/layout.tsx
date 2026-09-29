import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        className={`${plusJakarta.variable} ${geistMono.variable} font-sans antialiased bg-yazz-background text-yazz-text-dark`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
