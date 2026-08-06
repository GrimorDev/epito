import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;

  return {
    title: "Rachuno, portal klienta dla biur rachunkowych",
    description: "Automatyczne informacje o podatkach, płatności i dokumenty klientów w jednym miejscu.",
    openGraph: {
      title: "Mniej pytań o podatki. Więcej spokoju.",
      description: "Portal klienta dla biur rachunkowych.",
      type: "website",
      locale: "pl_PL",
      images: [{ url: `${baseUrl}/og-rachuno.png`, width: 1731, height: 909, alt: "Rachuno, platforma dla biur rachunkowych" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Mniej pytań o podatki. Więcej spokoju.",
      description: "Portal klienta dla biur rachunkowych.",
      images: [`${baseUrl}/og-rachuno.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
