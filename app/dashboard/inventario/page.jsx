"use client";

import { useEffect, useState } from "react";
import {
  getInventoryProducts,
  saveProduct,
  deleteProduct,
} from "@/src/lib/pos-api";
import { generateSku, generateBarcode } from "@/src/lib/product-codes";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import { useCurrency } from "@/src/hooks/useCurrency";

const emptyProduct = { name: "", price: "", cost: "", stock: "" };

export default function InventarioPage() {
  const { profile, branch } = useUserProfile();
  const { formatMoney, currency, setCurrency, currencies, currencyConfig } =
    useCurrency();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyProduct);
  const [previewCodes, setPreviewCodes] = useState({ sku: "", barcode: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);

  async function loadProducts() {
    if (!profile?.tenant_id || !branch?.id) return;

    const { data, error } = await getInventoryProducts(
      profile.tenant_id,
      branch.id
    );

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, [profile?.tenant_id, branch?.id]);

  useEffect(() => {
    if (editing || !form.name.trim()) {
      setPreviewCodes({ sku: "", barcode: "" });
      return;
    }

    setPreviewCodes((prev) => ({
      sku: generateSku(form.name, products),
      barcode: prev.barcode || generateBarcode(products),
    }));
  }, [form.name, editing, products]);

  function openCreate() {
    setEditing(null);
    setForm(emptyProduct);
    setPreviewCodes({ sku: "", barcode: "" });
    setShowForm(true);
  }

  function openEdit(product) {
    setEditing(product);
    setForm({
      name: product.name,
      price: String(product.price),
      cost: String(product.cost),
      stock: String(product.stock),
    });
    setPreviewCodes({ sku: product.sku || "", barcode: product.barcode || "" });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    const sku = editing
      ? editing.sku
      : previewCodes.sku || generateSku(form.name, products);
    const barcode = editing
      ? editing.barcode
      : previewCodes.barcode || generateBarcode(products);

    const productData = {
      name: form.name.trim(),
      sku,
      barcode,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      currency,
    };
    const stock = parseInt(form.stock, 10) || 0;

    const { error } = await saveProduct({
      editing,
      tenantId: profile.tenant_id,
      branchId: branch.id,
      productData,
      stock,
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({
        type: "success",
        text: editing
          ? "Producto actualizado."
          : `Producto creado — SKU: ${sku}, Código: ${barcode}`,
      });
      setShowForm(false);
      await loadProducts();
    }
    setSaving(false);
  }

  async function handleDelete(product) {
    if (!window.confirm(`¿Eliminar "${product.name}"?`)) return;

    const { error } = await deleteProduct(product.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Producto eliminado." });
      await loadProducts();
    }
  }

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario</h1>
          <p className="text-slate-500">
            Stock por sucursal: <strong>{branch?.name}</strong>
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + Nuevo producto
        </button>
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

      {showForm && (
        <div className="mb-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-lg font-semibold">
            {editing ? "Editar producto" : "Nuevo producto"}
          </h2>

          {!editing && (
            <p className="mb-4 text-sm text-slate-500">
              Ingresa el nombre y el sistema generará el SKU y código de barras
              automáticamente.
            </p>
          )}

          <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nombre del producto *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Jugo de Naranja 500ml"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
              />
            </div>

            {!editing && form.name.trim() && (
              <div className="sm:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Generados automáticamente
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <span className="text-xs text-slate-500">SKU</span>
                    <p className="font-mono text-sm font-medium text-slate-900">
                      {previewCodes.sku}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Código de barras</span>
                    <p className="font-mono text-sm font-medium text-slate-900">
                      {previewCodes.barcode}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {editing && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    SKU
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={previewCodes.sku}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Código de barras
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={previewCodes.barcode}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-600"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Moneda
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
              >
                {Object.values(currencies).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Precio ({currencyConfig.symbol})
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Costo ({currencyConfig.symbol})
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Stock ({branch?.name})
              </label>
              <input
                type="number"
                min="0"
                required
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Código barras</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No hay productos en esta sucursal
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {product.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {product.sku || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {product.barcode || "—"}
                    </td>
                    <td className="px-4 py-3">{formatMoney(product.price)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          product.stock <= 5
                            ? "bg-red-100 text-red-700"
                            : product.stock <= 20
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {product.stock} uds
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEdit(product)}
                        className="mr-2 text-indigo-600 hover:underline"
                      >
                        Editar
                      </button>
                      {profile?.role === "admin_org" && (
                        <button
                          onClick={() => handleDelete(product)}
                          className="text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
