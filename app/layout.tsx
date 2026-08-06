import type { Metadata, Viewport } from "next";
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

async function getBaseUrl() {
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b2927" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: "Epito, portal klienta dla biur rachunkowych",
      template: "%s | Epito",
    },
    description: "Portal klienta dla biur rachunkowych. Kwoty VAT, PIT i ZUS, dokumenty, płatności i przypomnienia w jednym bezpiecznym miejscu.",
    applicationName: "Epito",
    category: "finance",
    keywords: [
      "portal klienta biura rachunkowego",
      "program dla biura rachunkowego",
      "płatności podatków",
      "przypomnienia ZUS",
      "dokumenty księgowe",
      "KSeF",
      "Epito",
    ],
    authors: [{ name: "Epito" }],
    creator: "Epito",
    publisher: "Epito",
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "Mniej pytań o podatki. Więcej spokoju.",
      description: "Epito porządkuje płatności, dokumenty i komunikację klientów biura rachunkowego.",
      type: "website",
      locale: "pl_PL",
      url: baseUrl,
      siteName: "Epito",
      images: [{ url: `${baseUrl}/og.png`, width: 1536, height: 1024, alt: "Epito, portal klienta dla biur rachunkowych" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Mniej pytań o podatki. Więcej spokoju.",
      description: "Epito, portal klienta dla biur rachunkowych.",
      images: [`${baseUrl}/og.png`],
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const baseUrl = await getBaseUrl();
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Epito",
      url: baseUrl,
      logo: `${baseUrl}/favicon.svg`,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Epito",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: "Portal klienta dla biur rachunkowych do obsługi płatności, dokumentów i przypomnień.",
      url: baseUrl,
      offers: {
        "@type": "Offer",
        price: "149",
        priceCurrency: "PLN",
        category: "Program pilotażowy",
      },
      featureList: [
        "Informacje o VAT, PIT, CIT i ZUS",
        "Statusy dokumentów księgowych",
        "Przypomnienia o płatnościach",
        "Panel klienta biura rachunkowego",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Epito",
      url: baseUrl,
      inLanguage: "pl-PL",
    },
  ];

  return (
    <html lang="pl">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        {children}
      </body>
    </html>
  );
}
