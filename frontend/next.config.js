/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // required for the multi-stage Docker build
  serverExternalPackages: ["ffmpeg-static"],
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "cdn.myanimelist.net" },
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "cdn.anipixcdn.co" },
      { protocol: "https", hostname: "img.animeschedule.net" },
      { protocol: "https", hostname: "uploads.mangadex.org" },
      { protocol: "https", hostname: "cdn.asurascans.com" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
    outputFileTracingIncludes: {
      "/api/v1/streaming/download": ["./node_modules/ffmpeg-static/**/*"],
    },
  },
  compiler: {
    removeConsole: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
