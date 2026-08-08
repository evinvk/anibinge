import type { Metadata, Viewport } from "next";
import { Sora, Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { PushPrompt } from "@/components/push-prompt";
import { AnalyticsTracker } from "@/components/analytics-tracker";


const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Watch Anime Online Free — Stream & Track Episodes",
    template: "%s | Anibinge",
  },
  description:
    "Watch anime online free in HD. Stream sub & dub episodes, track your progress, and discover new series across thousands of titles.",
  keywords: [
    "watch anime online free",
    "anime streaming",
    "watch anime",
    "anime tracker",
    "free anime website",
    "anime online free",
    "anime episodes online",
    "sub and dub anime",
    "seasonal anime",
    "anime schedule",
    "anime watchlist",
    "stream anime free",
    "anime database",
    "anime website",
    "watch sub anime"
  ],
  openGraph: {
    type: "website",
    siteName: "Anibinge",
    url: SITE_URL,
    title: "Watch Anime Online Free — Stream & Track Episodes",
    description: "Watch anime online free in HD. Stream sub & dub episodes, track your progress, and discover new series.",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "Anibinge — Watch Anime Online Free in HD",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Anibinge — Watch Anime Online Free",
    description: "Watch anime online free in HD. Stream sub & dub, track your progress, discover new series.",
    images: ["/og.svg"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "icon", url: "/icons/icon-192.png" },
    ],
  },
  robots: { index: true, follow: true },
  verification: {
    google: "EBArdvL1QMFvvKlCxHS_2Abd8HAWSKVw2myNqEJRzwg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0F",
  width: "device-width",
  initialScale: 1,
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-PWXMN27P3E"
        ></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-PWXMN27P3E');`,
          }}
        />
      </head>
      <body className={`${sora.variable} ${inter.variable} ${jetbrains.variable}`}>
        {API_BASE && <link rel="preconnect" href={API_BASE} />}
        {API_BASE && <link rel="dns-prefetch" href={API_BASE} />}
        <link rel="preconnect" href="https://gogocdn.net" />
        <link rel="dns-prefetch" href="https://gogocdn.net" />
        <link rel="preconnect" href="https://s4.anilist.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://s4.anilist.co" />
        <link rel="preconnect" href="https://cdn.anipixcdn.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.anipixcdn.co" />
        <link rel="preconnect" href="https://graphql.anilist.co" />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <NotificationsProvider>
              <div className="relative min-h-screen bg-aura-gradient bg-fixed">
                <ServiceWorkerRegister />
                <PushPrompt />
                <AnalyticsTracker />
                <Navbar />
                <main>{children}</main>
                <Footer />
              </div>
            </NotificationsProvider>
          </AuthProvider>
        </ThemeProvider>
        <Script
          id="schema-org"
          strategy="beforeInteractive"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "Anibinge",
              "url": SITE_URL,
              "description": "Watch anime online free in HD. Stream sub & dub episodes, track your progress, and never miss new releases.",
              "potentialAction": {
                "@type": "SearchAction",
                "target": {
                  "@type": "EntryPoint",
                  "urlTemplate": `${SITE_URL}/search?q={search_term_string}`
                },
                "query-input": "required name=search_term_string"
              }
            }),
          }}
        />
        <Script
          id="monetag-zone"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(s){s.dataset.zone='11404928',s.src='https://al5sm.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))`,
          }}
        />
      </body>
    </html>
  );
}
