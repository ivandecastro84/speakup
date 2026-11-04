import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import { scriptTema } from "@/components/tema";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--fonte-inter", display: "swap" });
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--fonte-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Speak Up Idiomas", template: "%s · Speak Up Idiomas" },
  description: "Gestão acadêmica e operacional da Speak Up Idiomas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08112a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-theme="dark" className={`${inter.variable} ${montserrat.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
