"use client";

import { useEffect, useState } from "react";
import { getSalesReport } from "@/src/lib/pos-api";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import { useBranch } from "@/src/hooks/useBranchContext";
import { useCurrency } from "@/src/hooks/useCurrency";
import {
  PAYMENT_METHODS,
  PAYMENT_LABELS,
  getDefaultDateRange,
  getPaymentLabel,
  formatDateTime,
} from "@/src/lib/report-utils";
import { getReceiptNumber } from "@/src/lib/receipt-utils";

const PAYMENT_COLORS = {
  efectivo: "bg-emerald-500",
  transferencia: "bg-blue-500",
  tarjeta: "bg-violet-500",
  credito: "bg-amber-500",
};

export default function ReportesPage() {
  const { activeBranch: branch } = useBranch();
  const { formatMoney } = useCurrency();
  const defaults = getDefaultDateRange();

  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadReport() {
    if (!branch?.id) return;
    setLoading(true);

    const { data, error } = await getSalesReport(branch.id, {
      startDate,
      endDate,
      paymentMethod,
    });

    if (!error && data) {
      setReport(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadReport();
  }, [branch?.id, startDate, endDate, paymentMethod]);

  const summary = report?.summary;
  const paymentBreakdown = summary?.byPayment || {};
  const maxPaymentTotal = Math.max(
    ...Object.values(paymentBreakdown).map((p) => p.total),
    1
  );

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Reportes de ventas</h1>
        <p className="text-slate-500">
          Consulte ventas por rango de fechas y método de pago — {branch?.name}
        </p>
      </header>

      <div className="mb-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Filtros
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Desde
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Hasta
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Método de pago
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadReport}
              className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Actualizar reporte
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">Ventas en el periodo</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                {summary?.count || 0}
              </p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">Total vendido</p>
              <p className="mt-1 text-3xl font-bold text-indigo-600">
                {formatMoney(summary?.total || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">Ticket promedio</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                {formatMoney(
                  summary?.count ? summary.total / summary.count : 0
                )}
              </p>
            </div>
          </div>

          {Object.keys(paymentBreakdown).length > 0 && (
            <div className="mb-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Desglose por método de pago
              </h2>
              <div className="space-y-4">
                {Object.entries(paymentBreakdown).map(([method, data]) => (
                  <div key={method}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">
                        {PAYMENT_LABELS[method] || method}
                      </span>
                      <span className="text-slate-500">
                        {data.count} venta(s) — {formatMoney(data.total)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${PAYMENT_COLORS[method] || "bg-slate-400"}`}
                        style={{
                          width: `${(data.total / maxPaymentTotal) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">Detalle de ventas</h2>
            </div>
            {(report?.sales || []).length === 0 ? (
              <div className="px-4 py-12 text-center text-slate-400">
                No hay ventas en el periodo seleccionado
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">No. Recibo</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">{formatDateTime(sale.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {getReceiptNumber(sale.id)}
                      </td>
                      <td className="px-4 py-3">
                        {sale.client_name || "Cliente general"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${
                            PAYMENT_COLORS[
                              sale.type === "credito"
                                ? "credito"
                                : sale.payment_method || "efectivo"
                            ] || "bg-slate-400"
                          }`}
                        >
                          {getPaymentLabel(sale)}
                        </span>
                      </td>
                      <td className="px-4 py-3 capitalize">{sale.type}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatMoney(sale.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right font-semibold">
                      Total del periodo
                    </td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-indigo-600">
                      {formatMoney(summary?.total || 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
