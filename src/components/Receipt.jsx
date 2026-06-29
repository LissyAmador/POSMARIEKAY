"use client";

import { QRCodeSVG } from "qrcode.react";
import { formatDate } from "@/src/hooks/useUserProfile";
import { useCurrency } from "@/src/hooks/useCurrency";

export default function Receipt({ sale, items, tenant, branch, onClose }) {
  const { formatMoney } = useCurrency();
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );
  const qrValue = JSON.stringify({
    sale_id: sale.id,
    total: sale.total,
    date: sale.created_at,
    branch: branch?.name,
    verify: `https://pos-saas.vercel.app/verify/${sale.id}`,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 text-center">
          <h2 className="text-lg font-bold text-slate-900">
            {tenant?.name || "POS SaaS"}
          </h2>
          <p className="text-sm text-slate-500">{branch?.name}</p>
          <p className="mt-1 text-xs text-slate-400">
            Recibo #{sale.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-xs text-slate-400">{formatDate(sale.created_at)}</p>
        </div>

        <div className="px-6 py-4">
          {sale.client_name && (
            <p className="mb-3 text-sm">
              <span className="text-slate-500">Cliente: </span>
              <span className="font-medium">{sale.client_name}</span>
            </p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-2">Artículo</th>
                <th className="pb-2 text-center">Cant.</th>
                <th className="pb-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id || item.product_id}>
                  <td className="py-2 pr-2">
                    {item.products?.name || item.name}
                  </td>
                  <td className="py-2 text-center">{item.quantity}</td>
                  <td className="py-2 text-right">
                    {formatMoney(Number(item.price) * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-slate-900">
              <span>Total</span>
              <span>{formatMoney(sale.total)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Tipo</span>
              <span className="capitalize">{sale.type}</span>
            </div>
            {sale.type === "credito" && sale.due_date && (
              <div className="flex justify-between text-amber-600">
                <span>Vence</span>
                <span>{formatDate(sale.due_date)}</span>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col items-center">
            <QRCodeSVG value={qrValue} size={140} level="M" />
            <p className="mt-2 text-xs text-slate-400">
              Escanee para verificar el recibo
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700"
          >
            Nueva venta
          </button>
        </div>
      </div>
    </div>
  );
}
