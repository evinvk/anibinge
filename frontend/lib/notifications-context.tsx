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
  pushEnabled: boolean;
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
  pushEnabled: false,
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

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestArticles, setLatestArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const lastSeenRef = useRef<number | null>(null);

  useEffect(() => {
    lastSeenRef.current = getLastSeen();
    // Check if push is actually enabled (permission + subscription exists)
    if ("Notification" in window && "serviceWorker" in navigator) {
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

  const enablePush = useCallback(async (): Promise<boolean> => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("Push notifications not supported by this browser");
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        console.warn("Notification permission denied:", perm);
        return false;
      }

      // Ensure service worker is registered first
      let reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }

      // Wait for service worker to be active, with timeout
      if (!reg.active) {
        await Promise.race([
          new Promise<void>((resolve) => {
            if (reg!.active) return resolve();
            reg!.addEventListener("updatefound", () => {
              const sw = reg!.installing;
              if (sw) {
                sw.addEventListener("statechange", () => {
                  if (sw.state === "activated") resolve();
                });
              }
            });
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Service worker activation timeout")), 10000)),
        ]);
      }

      // Re-fetch registration after activation
      reg = await navigator.serviceWorker.getRegistration("/") || reg;

      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const res = await api.getVapidKey();
        const applicationServerKey = urlBase64ToUint8Array(res.public_key);

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const subJson = sub.toJSON();
      const p256dh = (subJson as any).keys?.p256dh || "";
      const auth = (subJson as any).keys?.auth || "";

      if (token) {
        await api.subscribePush(token, {
          endpoint: sub.endpoint,
          p256dh,
          auth,
        });
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
        await api.unsubscribePush(token, sub);
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
      value={{ unreadCount, latestArticles, loading, markAsRead, enablePush, disablePush, pushEnabled }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
