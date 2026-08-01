"use client";

import Script from "next/script";

const ADSTERRA_POPUNDER_SRC = "https://pl30634618.effectivecpmnetwork.com/45/ac/d2/45acd20dc587a39a6ca62586c7b07763.js";

export function AdsterraPopunder() {
  return <Script src={ADSTERRA_POPUNDER_SRC} strategy="afterInteractive" />;
}
