import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function needsUnoptimized(url: string): boolean {
  return url.includes("cdn.anipixcdn.co") || url.includes("uploads.mangadex.org");
}

const BROKEN_CDNS = ["img.animeschedule.net"];

export function hasValidImageUrl(url: string | null | undefined): url is string {
  if (!url || url.trim().length === 0 || !url.startsWith("http")) return false;
  return !BROKEN_CDNS.some((cdn) => url.includes(cdn));
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return "";
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
