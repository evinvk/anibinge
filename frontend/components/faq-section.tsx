"use client";

import { useEffect, useId } from "react";
import { ChevronDown } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSectionProps {
  items: FaqItem[];
  title?: string;
}

export function FaqSection({ items, title = "Frequently Asked Questions" }: FaqSectionProps) {
  const id = useId();

  useEffect(() => {
    if (items.length === 0) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = `faq-jsonld-${id}`;
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map((i) => ({
        "@type": "Question",
        name: i.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: i.answer,
        },
      })),
    });
    document.head.appendChild(script);
    return () => {
      document.getElementById(`faq-jsonld-${id}`)?.remove();
    };
  }, [items, id]);

  if (items.length === 0) return null;

  return (
    <section className="mt-12 pb-12">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item, i) => (
          <details
            key={i}
            className="group rounded-xl border border-white/5 bg-white/[0.02] transition-colors open:bg-white/[0.04]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-paper">
              {item.question}
              <ChevronDown className="h-4 w-4 shrink-0 text-mist transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-mist">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
