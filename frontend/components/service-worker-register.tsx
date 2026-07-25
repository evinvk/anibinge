"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update().catch(() => {});
      });

      navigator.serviceWorker.getRegistration("/monetag-sw.js").catch(() => {
        navigator.serviceWorker.register("/monetag-sw.js", { scope: "/" }).catch(() => {});
      });
    }
  }, []);
  return null;
}
