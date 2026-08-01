import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, siteUrl }: { items: Crumb[]; siteUrl: string }) {
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }, ...items];

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: `${siteUrl}${c.href}` } : {}),
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-mist">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-3 w-3 text-white/20" />}
                {c.href && !last ? (
                  <Link href={c.href} className="transition-colors hover:text-paper">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-paper">{c.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
