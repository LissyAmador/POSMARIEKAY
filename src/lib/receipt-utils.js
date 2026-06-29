export function getReceiptUrl(saleId) {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/recibo/${saleId}`;
  }
  return `https://pos-saas-black.vercel.app/recibo/${saleId}`;
}

/** Valor del QR: URL directa escaneable por cualquier lector */
export function buildQrValue(sale) {
  return getReceiptUrl(sale.id);
}

export function getReceiptNumber(saleId) {
  return saleId.slice(0, 8).toUpperCase();
}

export function getItemName(item) {
  return item.products?.name || item.name || "Artículo";
}

export function calculateSubtotal(items) {
  return items.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );
}

export function formatReceiptDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("es-GT", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatReceiptDateShort(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("es-GT", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
