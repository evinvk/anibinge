import type { Metadata, Viewport } from "next";
import { Sora, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ServiceWorkerRegister } from "@/components/service-worker-register";


const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Anibinge — Discover, Track & Never Miss an Episode",
    template: "%s | Anibinge",
  },
  description:
    "Anibinge is a modern anime discovery platform: track what's airing, browse by studio or genre, and build your watchlist across thousands of series.",
  keywords: ["anime", "anime tracker", "seasonal anime", "anime schedule", "watchlist", "anime database"],
  openGraph: {
    type: "website",
    siteName: "Anibinge",
    url: SITE_URL,
    title: "Anibinge — Discover, Track & Never Miss an Episode",
    description: "Track what's airing, browse by studio or genre, and build your watchlist.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Anibinge — Anime Discovery & Tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Anibinge",
    description: "Discover, track, and never miss an episode.",
    images: ["/og.png"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/favicon.ico?v=2", sizes: "any" },
    ],
    apple: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
    ],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sora.variable} ${inter.variable} ${jetbrains.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <NotificationsProvider>
              <div className="relative min-h-screen bg-aura-gradient bg-fixed">
                <ServiceWorkerRegister />
                <Navbar />
                <main>{children}</main>
                <Footer />
              </div>
            </NotificationsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
