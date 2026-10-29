import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cena · Catálogo",
  description: "Filmes, listas pessoais e histórico de assistidos.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
