import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Anibinge — Anime Discovery & Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0A0A0F 0%, #1a1035 50%, #0A0A0F 100%)",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow background */}
        <div
          style={{
            position: "absolute",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />

        {/* Star icon */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 32 32"
          style={{ position: "relative", marginBottom: 20 }}
        >
          <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="16" r="15" fill="#0A0A0F" stroke="url(#g)" strokeWidth="1.5" />
          <path
            d="M16 5 L18.5 12.5 L26 14 L19.5 18.5 L21 26 L16 21.5 L11 26 L12.5 18.5 L6 14 L13.5 12.5 Z"
            fill="url(#g)"
          />
        </svg>

        {/* Title */}
        <div
          style={{
            position: "relative",
            fontSize: 64,
            fontWeight: "bold",
            color: "white",
            letterSpacing: -1,
          }}
        >
          Anibinge
        </div>

        {/* Subtitle */}
        <div
          style={{
            position: "relative",
            fontSize: 24,
            color: "#A78BFA",
            marginTop: 12,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Discover · Track · Watch
        </div>

        {/* Description */}
        <div
          style={{
            position: "relative",
            fontSize: 18,
            color: "#9CA3AF",
            marginTop: 20,
            maxWidth: 600,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Track what&apos;s airing, browse by studio or genre, and build your watchlist.
        </div>
      </div>
    ),
    { ...size }
  );
}
