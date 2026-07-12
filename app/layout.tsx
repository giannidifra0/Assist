import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Configurazione corretta per la scheda del browser
export const metadata: Metadata = {
  title: "Z-Assist",
  description: "Il tuo CRM intelligente con Assistente IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it" // Impostato in italiano
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Mantiene il posizionamento corretto per layout full-screen */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}