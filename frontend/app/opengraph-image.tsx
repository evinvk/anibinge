import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0A0A0F 0%, #1a1033 50%, #0A0A0F 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32" style={{ marginBottom: 24 }}>
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
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: "-1px",
          }}
        >
          Anibinge
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#A78BFA",
            marginTop: 12,
          }}
        >
          Discover, Track & Never Miss an Episode
        </div>
      </div>
    ),
    { ...size }
  );
}
