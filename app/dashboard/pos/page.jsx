"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getPOSProducts,
  getCategories,
  processSale as processSaleApi,
  getSaleWithDetails,
} from "@/src/lib/pos-api";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import { useBranch } from "@/src/hooks/useBranchContext";
import { useCurrency } from "@/src/hooks/useCurrency";
import ProductImage from "@/src/components/ProductImage";
import Receipt from "@/src/components/Receipt";

export default function POSPage() {
  const { profile, tenant } = useUserProfile();
  const { activeBranch: branch } = useBranch();
  const { formatMoney } = useCurrency();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [clientName, setClientName] = useState("");
  const [saleType, setSaleType] = useState("contado");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [receipt, setReceipt] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  async function loadProducts() {
    if (!profile?.tenant_id || !branch?.id) return;

    const [prodRes, catRes] = await Promise.all([
      getPOSProducts(profile.tenant_id, branch.id),
      getCategories(profile.tenant_id),
    ]);

    if (!prodRes.error) setProducts(prodRes.data || []);
    setCategories(catRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, [profile?.tenant_id, branch?.id]);

  const filteredProducts = products.filter(
    (p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
        (p.barcode && p.barcode.includes(search));
      const matchesCategory =
        filterCategory === "all" || p.category_id === filterCategory;
      return matchesSearch && matchesCategory;
    }
  );

  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredProducts.forEach((product) => {
      const key = product.category_name || "Sin categoría";
      if (!groups[key]) groups[key] = [];
      groups[key].push(product);
    });
    return groups;
  }, [filteredProducts]);

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          price: Number(product.price),
          quantity: 1,
          maxStock: product.stock,
          image_url: product.image_url,
        },
      ];
    });
  }

  function updateQuantity(productId, delta) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product_id !== productId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > item.maxStock) return item;
          return { ...item, quantity: newQty };
        })
        .filter(Boolean)
    );
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  }

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  async function processSale() {
    if (cart.length === 0) {
      setMessage({ type: "error", text: "El carrito está vacío." });
      return;
    }

    if (saleType === "credito" && !dueDate) {
      setMessage({ type: "error", text: "Seleccione fecha de vencimiento para crédito." });
      return;
    }

    setProcessing(true);
    setMessage({ type: "", text: "" });

    const items = cart.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
    }));

    const { data, error } = await processSaleApi({
      clientName: clientName || null,
      saleType,
      paymentMethod,
      dueDate: saleType === "credito" ? dueDate : null,
      items,
      branchId: branch.id,
      userId: profile.user_id,
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
      setProcessing(false);
      return;
    }

    const saleId = data.sale_id;
    const { sale: saleData, details: detailsData } =
      await getSaleWithDetails(saleId);

    setReceipt({
      sale: saleData,
      items: detailsData || [],
      paymentMethod,
    });

    setCart([]);
    setClientName("");
    setDueDate("");
    setProcessing(false);
    await loadProducts();
  }

  function closeReceipt() {
    setReceipt(null);
    setMessage({ type: "success", text: "Venta procesada correctamente." });
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Punto de Venta</h1>
        <p className="text-slate-500">{branch?.name}</p>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Buscar por nombre, SKU o código de barras..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : Object.keys(groupedProducts).length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-400 ring-1 ring-slate-200">
              No hay productos disponibles
            </div>
          ) : (
            Object.entries(groupedProducts).map(([categoryName, items]) => (
              <div key={categoryName} className="mb-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-700">
                  {categoryName}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-300 hover:shadow-md"
                    >
                      <ProductImage
                        src={product.image_url}
                        name={product.name}
                        size="lg"
                        className="mb-3"
                      />
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.presentation_name}</p>
                      <p className="mt-1 text-lg font-bold text-indigo-600">
                        {formatMoney(product.price)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Stock: {product.stock}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Carrito</h2>

          {cart.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Sin artículos</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {cart.map((item) => (
                <li
                  key={item.product_id}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ProductImage src={item.image_url} name={item.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        {formatMoney(item.price)} c/u
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQuantity(item.product_id, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product_id, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      className="ml-1 text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-indigo-600">{formatMoney(cartTotal)}</span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <input
              type="text"
              placeholder="Nombre del cliente (opcional)"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Tipo de venta
              </label>
              <select
                value={saleType}
                onChange={(e) => setSaleType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              >
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </div>

            {saleType === "contado" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Método de pago
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>
            )}

            {saleType === "credito" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Fecha de vencimiento
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          <button
            onClick={processSale}
            disabled={processing || cart.length === 0}
            className="mt-5 w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {processing ? "Procesando..." : "Procesar venta"}
          </button>
        </div>
      </div>

      {receipt && (
        <Receipt
          sale={receipt.sale}
          items={receipt.items}
          tenant={tenant}
          branch={branch}
          paymentMethod={receipt.paymentMethod}
          onClose={closeReceipt}
        />
      )}
    </div>
  );
}
