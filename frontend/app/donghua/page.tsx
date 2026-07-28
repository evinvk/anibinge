import type { Metadata } from "next";
import DonghuaPageClient from "./donghua-page-client";

export const metadata: Metadata = {
  title: "Donghua — Watch Chinese Animation Online Free",
  description:
    "Stream donghua (Chinese anime) online free with English subtitles. Browse trending and latest Chinese animation series on Anibinge.",
  openGraph: {
    title: "Watch Donghua Online Free — Chinese Animation",
    description:
      "Stream donghua (Chinese anime) online free with English subtitles. Browse trending and latest releases.",
    type: "website",
  },
};

export default function DonghuaPage() {
  return <DonghuaPageClient />;
}
