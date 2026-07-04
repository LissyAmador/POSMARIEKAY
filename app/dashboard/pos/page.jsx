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
import {
  CARD_FEE_RATE,
  productMatchesSearch,
  formatAttributesSummary,
} from "@/src/lib/category-attributes";
import {
  getExpiryStatus,
  getExpiryAlertMessage,
  formatExpiryDate,
} from "@/src/lib/expiry-utils";

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
  const [showAllAvailable, setShowAllAvailable] = useState(true);
  const [requiresShipping, setRequiresShipping] = useState(false);
  const [shippingCost, setShippingCost] = useState("");

  async function loadProducts() {
    if (!profile?.tenant_id || !branch?.id) return;

    const [prodRes, catRes] = await Promise.all([
      getPOSProducts(profile.tenant_id, branch.id, { includeOutOfStock: false }),
      getCategories(profile.tenant_id),
    ]);

    if (!prodRes.error) setProducts(prodRes.data || []);
    setCategories(catRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, [profile?.tenant_id, branch?.id]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = productMatchesSearch(p, search);
      const matchesCategory =
        !showAllAvailable && filterCategory !== "all"
          ? p.category_id === filterCategory
          : filterCategory === "all" || p.category_id === filterCategory;
      return matchesSearch && matchesCategory && p.stock > 0;
    });
  }, [products, search, filterCategory, showAllAvailable]);

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
    const expiryStatus = getExpiryStatus(product);
    if (expiryStatus === "expired") {
      setMessage({
        type: "error",
        text: getExpiryAlertMessage(product) || "Producto de maquillaje vencido.",
      });
      return;
    }
    if (expiryStatus === "expiring_soon") {
      setMessage({
        type: "warning",
        text: `⚠️ ${getExpiryAlertMessage(product)}`,
      });
    }

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
          cost: Number(product.cost || 0),
          quantity: 1,
          maxStock: product.stock,
          image_url: product.image_url,
          category_name: product.category_name,
          attributes: product.attributes,
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

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const cartCost = cart.reduce(
    (sum, item) => sum + (item.cost || 0) * item.quantity,
    0
  );

  const grossProfit = cartSubtotal - cartCost;
  const cardFee =
    saleType === "contado" && paymentMethod === "tarjeta"
      ? grossProfit * CARD_FEE_RATE
      : 0;
  const shipping = requiresShipping ? parseFloat(shippingCost) || 0 : 0;
  const cartTotal = cartSubtotal + shipping;
  const netProfit = grossProfit - cardFee;

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
      cost: item.cost,
    }));

    const { data, error } = await processSaleApi({
      clientName: clientName || null,
      saleType,
      paymentMethod,
      dueDate: saleType === "credito" ? dueDate : null,
      items,
      branchId: branch.id,
      userId: profile.user_id,
      requiresShipping,
      shippingCost: shipping,
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
    setRequiresShipping(false);
    setShippingCost("");
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
              : message.type === "warning"
                ? "bg-amber-50 text-amber-800"
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
              placeholder="Buscar producto, SKU, tono, talla, color..."
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
            <button
              type="button"
              onClick={() => {
                setShowAllAvailable(true);
                setFilterCategory("all");
                setSearch("");
              }}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                showAllAvailable && filterCategory === "all" && !search
                  ? "bg-indigo-600 text-white"
                  : "border border-indigo-200 bg-indigo-50 text-indigo-700"
              }`}
            >
              Ver todo disponible
            </button>
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
                      {formatAttributesSummary(product.category_name, product.attributes) && (
                        <p className="text-xs text-indigo-600">
                          {formatAttributesSummary(product.category_name, product.attributes)}
                        </p>
                      )}
                      {getExpiryStatus(product) === "expiring_soon" && (
                        <p className="text-xs font-medium text-amber-700">
                          Vence {formatExpiryDate(product.attributes?.vencimiento)}
                        </p>
                      )}
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

          <div className="mt-4 border-t border-slate-200 pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span>{formatMoney(cartSubtotal)}</span>
            </div>
            {requiresShipping && shipping > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Envío (clienta ↔ vendedora)</span>
                <span>{formatMoney(shipping)}</span>
              </div>
            )}
            {cardFee > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Comisión tarjeta (5% ganancia)</span>
                <span>−{formatMoney(cardFee)}</span>
              </div>
            )}
            {cart.length > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Ganancia estimada</span>
                <span>{formatMoney(netProfit)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-1">
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
                  <option value="tarjeta">Tarjeta (descuenta 5% de ganancia)</option>
                </select>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={requiresShipping}
                  onChange={(e) => setRequiresShipping(e.target.checked)}
                  className="rounded border-slate-300"
                />
                ¿Requiere envío?
              </label>
              <p className="mt-1 text-xs text-slate-500">
                El envío se acuerda entre la clienta y la vendedora según ubicación.
              </p>
              {requiresShipping && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Costo de envío
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    placeholder="Ej. 25.00"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

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
