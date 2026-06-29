"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/src/components/Sidebar";
import BranchBanner from "@/src/components/BranchBanner";
import { CurrencyProvider } from "@/src/hooks/useCurrency";
import { BranchProvider } from "@/src/hooks/useBranchContext";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import { usePermissions } from "@/src/hooks/usePermissions";

const ROUTE_PERMISSIONS = {
  "/dashboard/pos": "pos.vender",
  "/dashboard/inventario": "inventario.gestionar",
  "/dashboard/caja": "caja.gestionar",
  "/dashboard/creditos": "creditos.gestionar",
  "/dashboard/recibos": "recibos.gestionar",
  "/dashboard/reportes": "reportes.ver",
  "/dashboard/administracion": "admin.access",
};

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, tenant, loading, error } = useUserProfile();
  const { can } = usePermissions();

  useEffect(() => {
    if (!loading && !profile) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile || loading) return;
    const required = ROUTE_PERMISSIONS[pathname];
    if (required && !can(required)) {
      router.replace("/dashboard");
    }
  }, [pathname, profile, loading, can, router]);

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
          <p className="mt-2 text-sm">
            {error || "Perfil no encontrado. Ejecuta link_superadmin en Supabase."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <CurrencyProvider>
      <BranchProvider>
        <div className="min-h-screen bg-slate-50">
          <Sidebar tenant={tenant} profile={profile} />
          <main className="ml-64 min-h-screen p-8">
            <BranchBanner />
            {children}
          </main>
        </div>
      </BranchProvider>
    </CurrencyProvider>
  );
}
