"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface NewsArticle {
  id: string;
  title: string;
  url: string;
  summary: string;
  image: string | null;
  category: string;
  published_at: string | null;
}

interface NotificationsState {
  unreadCount: number;
  latestArticles: NewsArticle[];
  loading: boolean;
  markAsRead: () => void;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
  requestPermission: () => void;
  pushEnabled: boolean;
  pushPermission: NotificationPermission | "unsupported";
}

const STORAGE_KEY = "anibinge:lastSeenNews";
const PUSH_SUB_KEY = "anibinge:pushSub";
const POLL_INTERVAL = 5 * 60 * 1000;

const NotificationsContext = createContext<NotificationsState>({
  unreadCount: 0,
  latestArticles: [],
  loading: true,
  markAsRead: () => {},
  enablePush: async () => false,
  disablePush: async () => {},
  requestPermission: () => {},
  pushEnabled: false,
  pushPermission: "unsupported",
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

function getLastSeen(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? Number(raw) : null;
}

function setLastSeen(ts: number) {
  localStorage.setItem(STORAGE_KEY, String(ts));
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getStoredSub(): { endpoint: string; p256dh: string; auth: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PUSH_SUB_KEY);
  return raw ? JSON.parse(raw) : null;
}

function storeSub(sub: { endpoint: string; p256dh: string; auth: string }) {
  localStorage.setItem(PUSH_SUB_KEY, JSON.stringify(sub));
}

function clearStoredSub() {
  localStorage.removeItem(PUSH_SUB_KEY);
}

function getPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestArticles, setLatestArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const lastSeenRef = useRef<number | null>(null);

  useEffect(() => {
    lastSeenRef.current = getLastSeen();
    setPushPermission(getPermissionState());

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(Notification.permission === "granted" && sub !== null);
        });
      });
    }
  }, []);

  const checkForNews = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.news(1, 30);
      const articles: NewsArticle[] = res.data ?? [];
      setLatestArticles(articles);

      const lastSeen = lastSeenRef.current;
      if (lastSeen === null) {
        setUnreadCount(0);
        return;
      }

      const unread = articles.filter((a) => {
        if (!a.published_at) return false;
        const published = new Date(a.published_at).getTime();
        return published > lastSeen;
      });
      setUnreadCount(unread.length);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkForNews();
    const interval = setInterval(checkForNews, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [checkForNews]);

  const markAsRead = useCallback(() => {
    const now = Date.now();
    lastSeenRef.current = now;
    setLastSeen(now);
    setUnreadCount(0);
  }, []);

  // Returns a promise that resolves when the browser permission dialog is answered.
  // Must be called from a synchronous click handler.
  const requestPermission = useCallback(() => {
    if (typeof Notification === "undefined") return Promise.resolve("unsupported" as const);
    if (Notification.permission === "granted") return Promise.resolve("granted" as const);
    if (Notification.permission === "denied") return Promise.resolve("denied" as const);
    return Notification.requestPermission();
  }, []);

  const enablePush = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      console.warn("Push notifications not supported");
      return false;
    }

    try {
      const perm = getPermissionState();
      if (perm === "denied") {
        console.warn("Notifications blocked by user");
        return false;
      }
      if (perm !== "granted") {
        console.warn("Permission not yet granted:", perm);
        return false;
      }

      // Get or register service worker
      let reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js");
      }

      // Wait for active state
      if (reg.installing || reg.waiting) {
        await new Promise<void>((resolve) => {
          const sw = reg!.installing || reg!.waiting;
          const timeout = setTimeout(resolve, 8000);
          if (!sw) { clearTimeout(timeout); return resolve(); }
          sw.addEventListener("statechange", () => {
            if (sw.state === "activated") { clearTimeout(timeout); resolve(); }
          });
        });
        reg = await navigator.serviceWorker.getRegistration("/") || reg;
      }

      if (!reg?.active) {
        console.error("No active service worker");
        return false;
      }

      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        // Fetch VAPID key
        const API_BASE = process.env.NEXT_PUBLIC_API_URL;
        if (!API_BASE) {
          console.error("NEXT_PUBLIC_API_URL not set");
          return false;
        }
        const res = await fetch(`${API_BASE}/api/v1/notifications/vapid-key`);
        if (!res.ok) throw new Error(`VAPID key failed: ${res.status}`);
        const { public_key } = await res.json();
        const applicationServerKey = urlBase64ToUint8Array(public_key);

        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }

      const subJson = sub.toJSON();
      const p256dh = (subJson as any).keys?.p256dh || "";
      const auth = (subJson as any).keys?.auth || "";

      if (token) {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL;
        if (!API_BASE) throw new Error("API URL not configured");
        const subRes = await fetch(`${API_BASE}/api/v1/notifications/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: sub.endpoint, p256dh, auth }),
        });
        if (!subRes.ok) {
          const body = await subRes.json().catch(() => ({}));
          throw new Error(`Subscribe API ${subRes.status}: ${JSON.stringify(body)}`);
        }
      }

      storeSub({ endpoint: sub.endpoint, p256dh, auth });
      setPushEnabled(true);
      return true;
    } catch (err) {
      console.error("Failed to enable push:", err);
      return false;
    }
  }, [token]);

  const disablePush = useCallback(async () => {
    try {
      const sub = getStoredSub();
      if (sub && token) {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL;
        if (API_BASE) {
          await fetch(`${API_BASE}/api/v1/notifications/unsubscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(sub),
          });
        }
      }

      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
      }

      clearStoredSub();
      setPushEnabled(false);
    } catch {
      // silent fail
    }
  }, [token]);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount, latestArticles, loading, markAsRead, enablePush, disablePush, requestPermission, pushEnabled, pushPermission }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
