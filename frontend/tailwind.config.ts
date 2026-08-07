import type { Config } from "tailwindcss";

// Anibinge design tokens
// bg-void   #0A0A0D  near-black with a warm tint
// surface   #151517  glass card base
// rose-600  #E11D48  primary (crimson)
// rose-400  #FB7185  glow / accent
// paper     #FAFAF8  light-mode background / dark-mode text
// mist      #8F8F96  muted text

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0A0A0D",
        surface: "#151517",
        "surface-hi": "#1E1E21",
        paper: "#FAFAF8",
        mist: "#8F8F96",
        primary: {
          DEFAULT: "#E11D48",
          50: "#FFF1F2",
          400: "#FB7185",
          500: "#F43F5E",
          600: "#E11D48",
          700: "#BE123C",
          900: "#881337",
        },
      },
      fontFamily: {
        display: ["var(--font-sora)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      backgroundImage: {
        "aura-gradient": "radial-gradient(circle at 20% 20%, rgba(225,29,72,0.32), transparent 55%), radial-gradient(circle at 80% 0%, rgba(251,113,133,0.20), transparent 45%)",
        "card-sheen": "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.08) 45%, transparent 60%)",
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(225,29,72,0.5)",
        "glow-sm": "0 0 20px -8px rgba(225,29,72,0.45)",
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
