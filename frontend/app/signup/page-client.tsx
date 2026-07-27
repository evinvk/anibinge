"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthForms } from "@/components/auth-forms";

export default function SignupPage() {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && token) router.replace("/profile");
  }, [token, loading, router]);

  if (loading) return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-mist">Loading…</div>;
  if (token) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-center">Create Account</h1>
      <p className="mt-1 text-center text-mist">Join Anibinge to track your anime.</p>
      <AuthForms initialMode="register" />
    </div>
  );
}
