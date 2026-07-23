import type { Metadata, Viewport } from "next";
import { Sora, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.app";

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
  },
  twitter: {
    card: "summary_large_image",
    title: "Anibinge",
    description: "Discover, track, and never miss an episode.",
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
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
                <Navbar />
                <main>{children}</main>
                <Footer />
              </div>
            </NotificationsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
      <script src="https://pl30495366.effectivecpmnetwork.com/1d/6b/a5/1d6ba5bb70bb38e1412d4a6f5c1da23f.js" async></script>
    </html>
  );
}
