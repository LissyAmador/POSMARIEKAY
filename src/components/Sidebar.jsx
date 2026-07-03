"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { auth, isDemoMode } from "@/src/lib/pos-api";
import { useCurrency } from "@/src/hooks/useCurrency";
import { usePermissions } from "@/src/hooks/usePermissions";
import { useBranch } from "@/src/hooks/useBranchContext";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/dashboard/pos", label: "POS", icon: "🛒", perm: "pos.vender" },
  {
    href: "/dashboard/inventario",
    label: "Inventario",
    icon: "📦",
    perm: "inventario.gestionar",
  },
  { href: "/dashboard/caja", label: "Caja", icon: "💰", perm: "caja.gestionar" },
  {
    href: "/dashboard/creditos",
    label: "Créditos",
    icon: "📋",
    perm: "creditos.gestionar",
  },
  {
    href: "/dashboard/recibos",
    label: "Recibos",
    icon: "🧾",
    perm: "recibos.gestionar",
  },
  { href: "/dashboard/reportes", label: "Reportes", icon: "📈", perm: "reportes.ver" },
  {
    href: "/dashboard/intercambios",
    label: "Intercambios",
    icon: "🔄",
    perm: "intercambios.gestionar",
  },
  {
    href: "/dashboard/servicio-tecnico",
    label: "Servicio Técnico",
    icon: "🔧",
    perm: "servicio_tecnico.gestionar",
  },
  {
    href: "/dashboard/administracion",
    label: "Administración",
    icon: "⚙️",
    perm: "admin.access",
  },
];

export default function Sidebar({ tenant, profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const demo = isDemoMode();
  const { currency, setCurrency, currencies } = useCurrency();
  const { can } = usePermissions();
  const { activeBranch } = useBranch();

  async function handleLogout() {
    await auth.signOut();
    router.push("/login");
  }

  const items = navItems.filter((item) => !item.perm || can(item.perm));

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-indigo-950 text-white shadow-xl">
      <div className="border-b border-indigo-800 px-6 py-5">
        <h1 className="text-lg font-bold tracking-tight">POS SaaS</h1>
        <p className="mt-1 truncate text-xs text-indigo-300">
          {tenant?.name || "Cargando..."}
        </p>
        <p className="truncate text-xs text-indigo-400">{activeBranch?.name || ""}</p>
        {demo && (
          <span className="mt-2 inline-block rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
            DEMO
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-indigo-200 hover:bg-indigo-900 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-indigo-800 px-4 py-4">
        <div className="mb-3">
          <label className="mb-1 block text-xs text-indigo-300">Moneda</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-lg border border-indigo-700 bg-indigo-900 px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
          >
            {Object.values(currencies).map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3 truncate text-xs text-indigo-300">
          Rol:{" "}
          <span className="font-semibold text-white">
            {profile?.role_name || profile?.role}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="w-full rounded-lg border border-indigo-700 px-3 py-2 text-sm text-indigo-200 transition hover:bg-indigo-900"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
