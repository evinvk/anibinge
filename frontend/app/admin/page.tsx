import type { Metadata } from "next";
import AdminPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Admin Dashboard — Anime Site Management",
  description: "Admin panel for managing anime site content, user reports, and system settings.",
};

export default function AdminPage() {
  return <AdminPageClient />;
}
