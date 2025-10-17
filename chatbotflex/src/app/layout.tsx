import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "CharBotFlex - Sistema de Atendimento WhatsApp",
  description: "Sistema completo de atendimento via WhatsApp com chatbot inteligente",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}