import type { Config } from "tailwindcss";

// Anibinge design tokens
// bg-void   #0A0A0F  near-black with a purple tint
// surface   #14121C  glass card base
// violet-600 #7C3AED  primary
// violet-400 #A78BFA  glow / accent
// paper     #F8F7FC  light-mode background / dark-mode text
// mist      #8B87A0  muted text

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0A0A0F",
        surface: "#14121C",
        "surface-hi": "#1D1A28",
        paper: "#F8F7FC",
        mist: "#8B87A0",
        primary: {
          DEFAULT: "#7C3AED",
          50: "#F3EEFE",
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
          900: "#3B0764",
        },
      },
      fontFamily: {
        display: ["var(--font-sora)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      backgroundImage: {
        "aura-gradient": "radial-gradient(circle at 20% 20%, rgba(124,58,237,0.35), transparent 55%), radial-gradient(circle at 80% 0%, rgba(167,139,250,0.25), transparent 45%)",
        "card-sheen": "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.08) 45%, transparent 60%)",
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(124,58,237,0.55)",
        "glow-sm": "0 0 20px -8px rgba(124,58,237,0.5)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        "sheen-sweep": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        sheen: "sheen-sweep 1.4s ease-in-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
