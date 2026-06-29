"use client";

import { useEffect, useState } from "react";
import {
  getIssuedReceipts,
  getSaleById,
  voidSale,
} from "@/src/lib/pos-api";
import { useUserProfile, formatDate } from "@/src/hooks/useUserProfile";
import { useCurrency } from "@/src/hooks/useCurrency";
import ReceiptModal from "@/src/components/ReceiptModal";
import { getReceiptNumber } from "@/src/lib/receipt-utils";

export default function RecibosPage() {
  const { tenant, branch } = useUserProfile();
  const { formatMoney } = useCurrency();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [modalData, setModalData] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function loadReceipts() {
    if (!branch?.id) return;

    const { data, error } = await getIssuedReceipts(branch.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setReceipts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadReceipts();
  }, [branch?.id]);

  async function openReceipt(saleId) {
    setActionLoading(true);
    const result = await getSaleById(saleId);
    if (result.error) {
      setMessage({ type: "error", text: result.error.message });
    } else {
      setModalData(result);
    }
    setActionLoading(false);
  }

  async function handleVoid(sale) {
    if (sale.status === "anulada") return;

    const confirmed = window.confirm(
      `¿Anular recibo No. ${getReceiptNumber(sale.id)}?\n\nSe revertirá inventario y movimientos de caja asociados.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    setMessage({ type: "", text: "" });

    const { error } = await voidSale(sale.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Recibo anulado correctamente." });
      if (modalData?.sale?.id === sale.id) {
        setModalData(null);
      }
      await loadReceipts();
    }
    setActionLoading(false);
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Recibos emitidos</h1>
        <p className="text-slate-500">
          Consulte, reimprima o anule ventas de {branch?.name}
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
      ) : receipts.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-4xl">🧾</p>
          <p className="mt-2 font-medium text-slate-700">No hay recibos emitidos</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">No.</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipts.map((sale) => {
                const isVoid = sale.status === "anulada";
                return (
                  <tr
                    key={sale.id}
                    className={isVoid ? "bg-red-50/40" : "hover:bg-slate-50"}
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {getReceiptNumber(sale.id)}
                    </td>
                    <td className="px-4 py-3">{formatDate(sale.created_at)}</td>
                    <td className="px-4 py-3">
                      {sale.client_name || "Cliente general"}
                    </td>
                    <td className="px-4 py-3 capitalize">{sale.type}</td>
                    <td className="px-4 py-3 font-medium">
                      {formatMoney(sale.total)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isVoid
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {isVoid ? "Anulado" : "Activo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openReceipt(sale.id)}
                        disabled={actionLoading}
                        className="mr-2 text-indigo-600 hover:underline disabled:opacity-50"
                      >
                        Ver / Imprimir
                      </button>
                      {!isVoid && (
                        <button
                          onClick={() => handleVoid(sale)}
                          disabled={actionLoading}
                          className="text-red-600 hover:underline disabled:opacity-50"
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalData && (
        <ReceiptModal
          sale={modalData.sale}
          items={modalData.items}
          tenant={modalData.tenant || tenant}
          branch={modalData.branch || branch}
          paymentMethod={modalData.paymentMethod}
          onClose={() => setModalData(null)}
          title={
            modalData.sale.status === "anulada"
              ? "Recibo anulado"
              : "Reimprimir recibo"
          }
        />
      )}
    </div>
  );
}
