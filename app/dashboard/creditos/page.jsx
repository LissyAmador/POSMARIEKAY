"use client";

import { useEffect, useState } from "react";
import {
  getPendingCredits,
  registerCreditPayment,
} from "@/src/lib/pos-api";
import {
  useUserProfile,
  formatDate,
  daysUntilDue,
} from "@/src/hooks/useUserProfile";
import { useCurrency } from "@/src/hooks/useCurrency";

export default function CreditosPage() {
  const { branch } = useUserProfile();
  const { formatMoney } = useCurrency();
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [paymentModal, setPaymentModal] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [processing, setProcessing] = useState(false);

  async function loadCredits() {
    if (!branch?.id) return;

    const { data, error } = await getPendingCredits(branch.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
      setLoading(false);
      return;
    }

    setCredits(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadCredits();
  }, [branch?.id]);

  function openPaymentModal(credit) {
    setPaymentModal(credit);
    setPaymentAmount(String(credit.pending));
    setMessage({ type: "", text: "" });
  }

  async function handlePayment() {
    if (!paymentModal) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setMessage({ type: "error", text: "Ingrese un monto válido." });
      return;
    }

    setProcessing(true);

    const { data, error } = await registerCreditPayment(
      paymentModal.id,
      amount
    );

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({
        type: "success",
        text: `Abono registrado. Saldo restante: ${formatMoney(data.remaining)}`,
      });
      setPaymentModal(null);
      setPaymentAmount("");
      await loadCredits();
    }
    setProcessing(false);
  }

  function getAlertStyle(credit) {
    const days = daysUntilDue(credit.due_date);
    if (days < 0) {
      return {
        bg: "bg-red-50 ring-red-200",
        badge: "bg-red-600 text-white",
        label: `VENCIDO hace ${Math.abs(days)} día(s)`,
      };
    }
    if (days <= 3) {
      return {
        bg: "bg-amber-50 ring-amber-200",
        badge: "bg-amber-500 text-white",
        label: `Vence en ${days} día(s)`,
      };
    }
    return {
      bg: "bg-white ring-slate-200",
      badge: "bg-slate-200 text-slate-700",
      label: `Vence en ${days} día(s)`,
    };
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Créditos</h1>
        <p className="text-slate-500">
          Ventas a crédito pendientes — alertas de cobro
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

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      ) : credits.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-4xl">✅</p>
          <p className="mt-2 font-medium text-slate-700">
            No hay créditos pendientes
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {credits.map((credit) => {
            const alert = getAlertStyle(credit);
            const days = daysUntilDue(credit.due_date);
            const isOverdue = days < 0;

            return (
              <div
                key={credit.id}
                className={`rounded-xl p-5 shadow-sm ring-1 ${alert.bg}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {credit.client_name || "Cliente general"}
                      </h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${alert.badge}`}
                      >
                        {alert.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Venta del {formatDate(credit.created_at)} · Vence:{" "}
                      {formatDate(credit.due_date)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-400">
                      ID: {credit.id.slice(0, 8)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-slate-500">Total</p>
                    <p className="text-lg font-bold">
                      {formatMoney(credit.total)}
                    </p>
                    <p className="text-sm text-emerald-600">
                      Abonado: {formatMoney(credit.paid)}
                    </p>
                    <p
                      className={`text-xl font-bold ${
                        isOverdue ? "text-red-600" : "text-slate-900"
                      }`}
                    >
                      Pendiente: {formatMoney(credit.pending)}
                    </p>
                  </div>
                </div>

                {isOverdue && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-800">
                    ⚠️ ALERTA: Esta cuenta está vencida. Cobrar urgentemente.
                  </div>
                )}

                <button
                  onClick={() => openPaymentModal(credit)}
                  className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Registrar Abono
                </button>
              </div>
            );
          })}
        </div>
      )}

      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Registrar Abono
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {paymentModal.client_name || "Cliente general"}
            </p>
            <p className="mt-2 text-sm">
              Saldo pendiente:{" "}
              <strong className="text-red-600">
                {formatMoney(paymentModal.pending)}
              </strong>
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Monto del abono
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={paymentModal.pending}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                El abono se sumará al flujo de la caja abierta.
              </p>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={handlePayment}
                disabled={processing}
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {processing ? "Registrando..." : "Confirmar abono"}
              </button>
              <button
                onClick={() => setPaymentModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
