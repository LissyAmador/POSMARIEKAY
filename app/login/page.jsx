"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, isDemoMode } from "@/src/lib/pos-api";

const DEMO_ACCOUNTS = [
  {
    org: "Plataforma (Super Usuario)",
    role: "Super Administrador",
    email: "superadmin@pos.demo",
    password: "SuperAdmin123!",
    access: "Crea organizaciones y accede a todo el sistema",
  },
  {
    org: "Chino Cell",
    role: "Administrador",
    email: "admin@chinocell.demo",
    password: "ChinoAdmin123!",
    access: "Todas las pantallas — cambia entre sucursales desde el menú",
  },
  {
    org: "Chino Cell — Chino Cel 1",
    role: "Ventas",
    email: "ventas1@chinocell.demo",
    password: "Ventas123!",
    access: "POS e Inventario",
  },
  {
    org: "Chino Cell — Chino Cel 2",
    role: "Ventas",
    email: "ventas2@chinocell.demo",
    password: "Ventas123!",
    access: "POS e Inventario",
  },
  {
    org: "Chino Cell — Chino Cel 1",
    role: "Contabilidad",
    email: "contabilidad1@chinocell.demo",
    password: "Conta123!",
    access: "Caja, Reportes y Recibos",
  },
  {
    org: "Chino Cell — Chino Cel 2",
    role: "Contabilidad",
    email: "contabilidad2@chinocell.demo",
    password: "Conta123!",
    access: "Caja, Reportes y Recibos",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const demo = isDemoMode();
  const [email, setEmail] = useState("superadmin@pos.demo");
  const [password, setPassword] = useState("SuperAdmin123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function fillAccount(account) {
    setEmail(account.email);
    setPassword(account.password);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600 text-2xl font-bold text-white">
            P
          </div>
          <h1 className="text-2xl font-bold text-slate-900">POS SaaS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sistema multi-tenant de punto de venta
          </p>
          {demo && (
            <span className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Modo demostración — datos de prueba incluidos
            </span>
          )}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "Ingresando..." : "Iniciar sesión demo"}
          </button>
        </form>

        <div className="mt-6 rounded-lg bg-slate-50 p-4">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
            Cuentas de demostración
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillAccount(account)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{account.role}</p>
                    <p className="text-slate-500">{account.org}</p>
                    <p className="mt-1 font-mono text-slate-600">
                      {account.email} / {account.password}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-indigo-600">
                    Usar →
                  </span>
                </div>
                <p className="mt-1 text-slate-400">{account.access}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
