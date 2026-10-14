import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Cotações Ciclo",
  description: "Sistema de cotações da Ciclo Comercial",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b3d5c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
