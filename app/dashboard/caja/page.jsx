"use client";

import { useEffect, useState } from "react";
import {
  getCashRegisterData,
  openCashRegister,
  closeCashRegister,
} from "@/src/lib/pos-api";
import { useUserProfile, formatDate } from "@/src/hooks/useUserProfile";
import { useBranch } from "@/src/hooks/useBranchContext";
import { useCurrency } from "@/src/hooks/useCurrency";

export default function CajaPage() {
  const { profile } = useUserProfile();
  const { activeBranch: branch } = useBranch();
  const { formatMoney } = useCurrency();
  const [openRegister, setOpenRegister] = useState(null);
  const [history, setHistory] = useState([]);
  const [initialBalance, setInitialBalance] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  async function loadData() {
    if (!branch?.id) return;

    const { open, closed } = await getCashRegisterData(branch.id);
    setOpenRegister(open);
    setHistory(closed || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [branch?.id]);

  async function handleOpenRegister() {
    const amount = parseFloat(initialBalance);
    if (isNaN(amount) || amount < 0) {
      setMessage({ type: "error", text: "Ingrese un monto inicial válido." });
      return;
    }

    setActionLoading(true);
    setMessage({ type: "", text: "" });

    const { error } = await openCashRegister({
      branchId: branch.id,
      userId: profile.user_id,
      initialBalance: amount,
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setInitialBalance("");
      setMessage({ type: "success", text: "Caja abierta correctamente." });
      await loadData();
    }
    setActionLoading(false);
  }

  async function handleCloseRegister() {
    if (!openRegister) return;

    const expected = Number(openRegister.current_balance);
    const confirmed = window.confirm(
      `¿Cerrar caja?\n\nMonto inicial: ${formatMoney(openRegister.initial_balance)}\nEsperado en caja: ${formatMoney(expected)}`
    );
    if (!confirmed) return;

    setActionLoading(true);
    setMessage({ type: "", text: "" });

    const { error } = await closeCashRegister(openRegister.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({
        type: "success",
        text: `Caja cerrada. Monto esperado: ${formatMoney(expected)}`,
      });
      await loadData();
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Caja — Turnos</h1>
        <p className="text-slate-500">
          Control de flujo de efectivo por turno en {branch?.name}
        </p>
      </header>

      {message.text && (
        <div
          className={`mb-6 rounded-lg px-4 py-3 text-sm ${
            message.type === "error"
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {!openRegister ? (
        <div className="max-w-md rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Abrir Caja</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ingrese el monto inicial en efectivo para iniciar el turno.
          </p>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Monto inicial ($)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="0.00"
            />
          </div>
          <button
            onClick={handleOpenRegister}
            disabled={actionLoading}
            className="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {actionLoading ? "Abriendo..." : "Abrir Caja"}
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Turno Activo</h2>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                ABIERTA
              </span>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-slate-500">Apertura</span>
                <span className="font-medium">{formatDate(openRegister.opened_at)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-slate-500">Monto inicial</span>
                <span className="font-medium">
                  {formatMoney(openRegister.initial_balance)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-lg font-semibold text-slate-700">
                  Flujo acumulado
                </span>
                <span className="text-2xl font-bold text-emerald-600">
                  {formatMoney(openRegister.current_balance)}
                </span>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              Se actualiza automáticamente cada 5 segundos con ventas y abonos.
            </p>

            <button
              onClick={handleCloseRegister}
              disabled={actionLoading}
              className="mt-6 w-full rounded-lg bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {actionLoading ? "Cerrando..." : "Cerrar Caja"}
            </button>
          </div>

          <div className="rounded-xl bg-indigo-50 p-6 ring-1 ring-indigo-100">
            <h3 className="font-semibold text-indigo-900">Cálculo al cierre</h3>
            <div className="mt-4 space-y-2 text-sm text-indigo-800">
              <p>
                Monto inicial:{" "}
                <strong>{formatMoney(openRegister.initial_balance)}</strong>
              </p>
              <p>+ Ventas al contado y abonos registrados durante el turno</p>
              <p className="border-t border-indigo-200 pt-2 text-base">
                Esperado en caja:{" "}
                <strong className="text-lg">
                  {formatMoney(openRegister.current_balance)}
                </strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Historial de turnos cerrados
          </h2>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Apertura</th>
                  <th className="px-4 py-3">Cierre</th>
                  <th className="px-4 py-3">Inicial</th>
                  <th className="px-4 py-3">Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((reg) => (
                  <tr key={reg.id}>
                    <td className="px-4 py-3">{formatDate(reg.opened_at)}</td>
                    <td className="px-4 py-3">{formatDate(reg.closed_at)}</td>
                    <td className="px-4 py-3">
                      {formatMoney(reg.initial_balance)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {formatMoney(reg.current_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
