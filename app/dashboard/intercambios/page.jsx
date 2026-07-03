"use client";

import { useEffect, useState } from "react";
import {
  getTenantSellers,
  getSellerExchanges,
  processSellerExchange,
  getInventoryProducts,
} from "@/src/lib/pos-api";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import { useBranch } from "@/src/hooks/useBranchContext";
import { useCurrency } from "@/src/hooks/useCurrency";
import { formatDateTime } from "@/src/lib/report-utils";

export default function IntercambiosPage() {
  const { profile } = useUserProfile();
  const { activeBranch: branch } = useBranch();
  const { formatMoney } = useCurrency();

  const [sellers, setSellers] = useState([]);
  const [products, setProducts] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [type, setType] = useState("producto");
  const [toUserId, setToUserId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cashAmount, setCashAmount] = useState("");
  const [notes, setNotes] = useState("");

  async function loadAll() {
    if (!profile?.tenant_id || !branch?.id) return;
    setLoading(true);

    const [sellersRes, productsRes, exchangesRes] = await Promise.all([
      getTenantSellers(profile.tenant_id),
      getInventoryProducts(profile.tenant_id, branch.id),
      getSellerExchanges(profile.tenant_id, branch.id),
    ]);

    setSellers((sellersRes.data || []).filter((s) => s.user_id !== profile.user_id));
    setProducts((productsRes.data || []).filter((p) => p.stock > 0));
    setExchanges(exchangesRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, [profile?.tenant_id, profile?.user_id, branch?.id]);

  const selectedProduct = products.find((p) => p.id === productId);
  const toSeller = sellers.find((s) => s.user_id === toUserId);
  const costPreview =
    type === "producto" && selectedProduct
      ? Number(selectedProduct.cost) * (parseInt(quantity, 10) || 0)
      : parseFloat(cashAmount) || 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!toUserId) {
      setMessage({ type: "error", text: "Seleccione la vendedora destino." });
      return;
    }

    setSaving(true);
    setMessage({ type: "", text: "" });

    const { error } = await processSellerExchange({
      tenantId: profile.tenant_id,
      fromUserId: profile.user_id,
      fromBranchId: branch.id,
      toUserId,
      toBranchId: toSeller?.branch_id,
      type,
      productId: type === "producto" ? productId : null,
      quantity: parseInt(quantity, 10) || 1,
      cashAmount: parseFloat(cashAmount) || 0,
      notes,
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({
        type: "success",
        text:
          type === "producto"
            ? `Intercambio registrado al costo (${formatMoney(costPreview)}).`
            : `Intercambio en efectivo registrado (${formatMoney(costPreview)}).`,
      });
      setProductId("");
      setQuantity("1");
      setCashAmount("");
      setNotes("");
      await loadAll();
    }
    setSaving(false);
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Intercambios entre vendedoras</h1>
        <p className="text-slate-500">
          Intercambie producto al costo o efectivo con otra vendedora — {branch?.name}
        </p>
      </header>

      {message.text && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            message.type === "error"
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
        >
          <h2 className="mb-4 text-lg font-semibold">Nuevo intercambio</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Tipo de intercambio</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="producto">Producto (al costo)</option>
                <option value="efectivo">Efectivo</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Vendedora destino *</label>
              <select
                required
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Seleccionar...</option>
                {sellers.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.name} — {s.branch_name}
                  </option>
                ))}
              </select>
            </div>

            {type === "producto" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">Producto *</label>
                  <select
                    required
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Seleccionar...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — stock: {p.stock} — costo: {formatMoney(p.cost)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedProduct?.stock || 1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            {type === "efectivo" && (
              <div>
                <label className="mb-1 block text-sm font-medium">Monto en efectivo *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">Notas (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Motivo del intercambio..."
              />
            </div>

            {costPreview > 0 && (
              <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                Valor del intercambio: <strong>{formatMoney(costPreview)}</strong>
                {type === "producto" && " (precio de costo)"}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || sellers.length === 0}
              className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Registrando..." : "Registrar intercambio"}
            </button>
          </div>
        </form>

        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-lg font-semibold">Historial</h2>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : exchanges.length === 0 ? (
            <p className="text-sm text-slate-400">No hay intercambios registrados.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {exchanges.map((ex) => (
                <li key={ex.id} className="py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {ex.type === "producto"
                          ? `${ex.quantity}x ${ex.product_name}`
                          : "Intercambio en efectivo"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {ex.from_user_id === profile.user_id ? "Enviado a" : "Recibido de"}{" "}
                        {ex.from_user_id === profile.user_id
                          ? ex.to_user_name
                          : ex.from_user_name}
                      </p>
                      {ex.notes && (
                        <p className="mt-1 text-xs text-slate-400">{ex.notes}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-indigo-600">
                        {formatMoney(ex.amount)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDateTime(ex.created_at)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
