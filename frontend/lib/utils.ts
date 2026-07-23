import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function needsUnoptimized(url: string): boolean {
  return url.includes("cdn.anipixcdn.co") || url.includes("img.animeschedule.net");
}
