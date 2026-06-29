"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/src/components/Sidebar";
import { CurrencyProvider } from "@/src/hooks/useCurrency";
import { useUserProfile } from "@/src/hooks/useUserProfile";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const { profile, tenant, branch, loading, error } = useUserProfile();

  useEffect(() => {
    if (!loading && !profile) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md rounded-xl bg-red-50 p-6 text-center text-red-700">
          <p className="font-semibold">Error de autenticación</p>
          <p className="mt-2 text-sm">{error || "Perfil no encontrado. Ejecuta link_superadmin en Supabase."}</p>
        </div>
      </div>
    );
  }

  return (
    <CurrencyProvider>
      <div className="min-h-screen bg-slate-50">
        <Sidebar tenant={tenant} branch={branch} profile={profile} />
        <main className="ml-64 min-h-screen p-8">{children}</main>
      </div>
    </CurrencyProvider>
  );
}
