import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function needsUnoptimized(url: string): boolean {
  return url.includes("cdn.anipixcdn.co");
}

const BROKEN_CDNS = ["img.animeschedule.net"];

export function hasValidImageUrl(url: string | null | undefined): url is string {
  if (!url || url.trim().length === 0 || !url.startsWith("http")) return false;
  return !BROKEN_CDNS.some((cdn) => url.includes(cdn));
}
