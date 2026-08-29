import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexo — Inteligência local',
  description: 'Assistente local para conhecimento, programação, documentos e imagens.',
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
