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
  requestPushPermission: () => Promise<boolean>;
  pushEnabled: boolean;
}

const STORAGE_KEY = "anibinge:lastSeenNews";
const POLL_INTERVAL = 5 * 60 * 1000;

const NotificationsContext = createContext<NotificationsState>({
  unreadCount: 0,
  latestArticles: [],
  loading: true,
  markAsRead: () => {},
  requestPushPermission: async () => false,
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

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestArticles, setLatestArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const lastSeenRef = useRef<number | null>(null);

  useEffect(() => {
    lastSeenRef.current = getLastSeen();
    if ("Notification" in window) {
      setPushEnabled(Notification.permission === "granted");
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

      if (unread.length > 0 && pushEnabled && document.visibilityState === "visible") {
        if (Notification.permission === "granted") {
          new Notification("Anibinge News", {
            body: `${unread.length} new article${unread.length > 1 ? "s" : ""}: ${unread[0].title}`,
            icon: "/icons/icon-192.png",
          });
        }
      }
    } catch {
      // silent fail — notifications are non-critical
    } finally {
      setLoading(false);
    }
  }, [pushEnabled]);

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

  const requestPushPermission = useCallback(async () => {
    if (!("Notification" in window)) return false;
    const perm = await Notification.requestPermission();
    const granted = perm === "granted";
    setPushEnabled(granted);
    return granted;
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount, latestArticles, loading, markAsRead, requestPushPermission, pushEnabled }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
