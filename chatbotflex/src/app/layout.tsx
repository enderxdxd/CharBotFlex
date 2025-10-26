import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthLoading } from "@/components/auth/AuthLoading";

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
        <AuthProvider>
          <AuthLoading>
            {children}
          </AuthLoading>
        </AuthProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}