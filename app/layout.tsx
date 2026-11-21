import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/ToastProvider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Z-Assist | Knowledge Base & Assistente IA',
  description: 'Piattaforma aziendale per gestione Knowledge Base, manuali PDF e assistente IA.',
};

const themeInitScript = `
try {
  var saved = localStorage.getItem('color-scheme');
  if (!saved) {
    var legacy = localStorage.getItem('crm_theme');
    if (legacy === 'dark' || legacy === 'light') {
      saved = legacy;
      localStorage.setItem('color-scheme', legacy);
      localStorage.removeItem('crm_theme');
    }
  }
  var scheme = (saved === 'dark' || saved === 'light') ? saved : 'light dark';
  var meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', scheme);
  var isDark = scheme === 'dark' || (scheme === 'light dark' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
} catch (e) {}
`.trim();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
