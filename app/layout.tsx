import type { Metadata } from 'next';
import { PRODUCT_BRAND } from '@/lib/nexo/brand';
import './globals.css';

export const metadata: Metadata = {
  title: `${PRODUCT_BRAND.displayName} — ${PRODUCT_BRAND.tagline}`,
  description: PRODUCT_BRAND.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{const t=localStorage.getItem('nexo-theme');document.documentElement.classList.toggle('dark',t?t==='dark':!matchMedia('(prefers-color-scheme: light)').matches)}catch{}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
