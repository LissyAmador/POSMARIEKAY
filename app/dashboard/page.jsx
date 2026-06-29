"use client";

import { useEffect, useState } from "react";
import { getDashboardStats } from "@/src/lib/pos-api";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import { useBranch } from "@/src/hooks/useBranchContext";
import { useCurrency } from "@/src/hooks/useCurrency";

export default function DashboardPage() {
  const { tenant } = useUserProfile();
  const { activeBranch: branch } = useBranch();
  const { formatMoney } = useCurrency();
  const [stats, setStats] = useState({
    products: 0,
    salesToday: 0,
    revenueToday: 0,
    pendingCredits: 0,
    openRegister: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branch?.id) return;

    async function loadStats() {
      const data = await getDashboardStats(branch.id);
      setStats(data);
      setLoading(false);
    }

    loadStats();
  }, [branch?.id]);

  const cards = [
    { label: "Productos en inventario", value: stats.products, color: "bg-blue-500" },
    { label: "Ventas hoy", value: stats.salesToday, color: "bg-emerald-500" },
    { label: "Ingresos hoy", value: formatMoney(stats.revenueToday), color: "bg-violet-500" },
    { label: "Créditos pendientes", value: stats.pendingCredits, color: "bg-amber-500" },
  ];

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500">
          Resumen de {branch?.name || "tu sucursal"} — {tenant?.name}
        </p>
        {tenant?.description && (
          <p className="mt-2 max-w-2xl text-sm text-slate-400">{tenant.description}</p>
        )}
      </header>

      {stats.openRegister ? (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Caja abierta — puedes procesar ventas al contado y registrar abonos.
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Caja cerrada — abre un turno en el módulo Caja antes de vender al contado.
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
            >
              <div className={`h-1 ${card.color}`} />
              <div className="p-5">
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
