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
      console.warn("Push notifications not supported");
      return false;
    }

    try {
      if (Notification.permission === "denied") {
        console.warn("Notifications blocked by browser");
        return false;
      }

      // Register service worker
      let reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }

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

      if (!reg.active) return false;

      // Check for existing subscription
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        // Get VAPID key
        const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(`${API_BASE}/api/v1/notifications/vapid-key`, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error(`VAPID key failed: ${res.status}`);
        const { public_key } = await res.json();
        const applicationServerKey = urlBase64ToUint8Array(public_key);

        // subscribe() will prompt for permission automatically on desktop.
        // On mobile, it may throw if permission hasn't been granted yet.
        try {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        } catch (subErr: any) {
          // If blocked, try requesting permission first then subscribing
          if (Notification.permission === "default" && typeof Notification.requestPermission === "function") {
            // On desktop this works; on mobile this may hang — wrap with page visibility
            const perm = await Notification.requestPermission();
            if (perm !== "granted") return false;
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
          } else {
            throw subErr;
          }
        }
      }

      const subJson = sub.toJSON();
      const p256dh = (subJson as any).keys?.p256dh || "";
      const auth = (subJson as any).keys?.auth || "";

      if (token) {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        const subRes = await fetch(`${API_BASE}/api/v1/notifications/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: sub.endpoint, p256dh, auth }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!subRes.ok) {
          const body = await subRes.json().catch(() => ({}));
          console.error("Subscribe API error:", body);
          throw new Error(`Subscribe failed: ${subRes.status}`);
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
