"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/seasonal", label: "Seasonal" },
  { href: "/schedule", label: "Schedule" },
  { href: "/news", label: "News" },
];

export function AnimeSectionTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <div className={cn("flex flex-wrap justify-center gap-2", className)}>
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary-400/40 bg-primary-500/15 text-primary-300"
                : "border-white/10 bg-white/5 text-mist hover:text-paper"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
