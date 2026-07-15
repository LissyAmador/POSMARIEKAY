/** Vencimiento de productos */

export const EXPIRY_WARNING_DAYS = 30;

const PLACEHOLDER_DATES = new Set(["2027-12-31", ""]);

export function hasExpirationDate(product) {
  return !!parseExpiryDate(product?.attributes?.vencimiento);
}

/** @deprecated Use hasExpirationDate — maquillaje u otro producto con fecha */
export function isMakeupProduct(product) {
  return hasExpirationDate(product) || /maquillaje/i.test(String(product?.attributes?.linea || ""));
}

export function requiresExpirationDate(categoryName) {
  return normalizeCategoryName(categoryName) === "MARY KAY";
}

function normalizeCategoryName(name) {
  return (name || "").trim().toUpperCase();
}

export function parseExpiryDate(value) {
  if (!value || PLACEHOLDER_DATES.has(String(value).trim())) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatExpiryDate(value) {
  const date = parseExpiryDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("es-GT", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function daysUntilExpiry(value) {
  const expiry = parseExpiryDate(value);
  if (!expiry) return null;
  const today = startOfDay(new Date());
  const expDay = startOfDay(expiry);
  return Math.ceil((expDay - today) / (1000 * 60 * 60 * 24));
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** @returns {'none'|'ok'|'expiring_soon'|'expired'} */
export function getExpiryStatus(product, daysBefore = EXPIRY_WARNING_DAYS) {
  const expiry = parseExpiryDate(product?.attributes?.vencimiento);
  if (!expiry) return "none";

  const today = startOfDay(new Date());
  const expDay = startOfDay(expiry);

  if (expDay < today) return "expired";

  const warningLimit = new Date(today);
  warningLimit.setDate(warningLimit.getDate() + daysBefore);

  if (expDay <= warningLimit) return "expiring_soon";
  return "ok";
}

export function getExpiryAlertMessage(product) {
  const status = getExpiryStatus(product);
  const dateLabel = formatExpiryDate(product?.attributes?.vencimiento);
  const days = daysUntilExpiry(product?.attributes?.vencimiento);

  if (status === "expired") {
    return `"${product.name}" venció el ${dateLabel}. Retírelo del inventario.`;
  }
  if (status === "expiring_soon") {
    const daysText =
      days === 0
        ? "vence hoy"
        : days === 1
          ? "vence mañana"
          : `vence en ${days} días (${dateLabel})`;
    return `"${product.name}" está próximo a vencer — ${daysText}.`;
  }
  return null;
}

export function getExpirationAlerts(products, { onlyInStock = true } = {}) {
  const alerts = [];

  for (const product of products) {
    if (!hasExpirationDate(product)) continue;
    if (onlyInStock && !(product.stock > 0)) continue;

    const status = getExpiryStatus(product);
    if (status === "none" || status === "ok") continue;

    alerts.push({
      product,
      status,
      message: getExpiryAlertMessage(product),
      expiryDate: product.attributes?.vencimiento,
      daysRemaining: daysUntilExpiry(product.attributes?.vencimiento),
    });
  }

  return alerts.sort((a, b) => {
    const order = { expired: 0, expiring_soon: 1 };
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }
    return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999);
  });
}

/** @deprecated */
export const getMakeupExpirationAlerts = getExpirationAlerts;

export const EXPIRY_STATUS_LABELS = {
  expired: "Vencido",
  expiring_soon: "Próximo a vencer",
  ok: "Vigente",
  none: "Sin fecha",
};

export const EXPIRY_STATUS_STYLES = {
  expired: "bg-red-100 text-red-800 ring-red-200",
  expiring_soon: "bg-amber-100 text-amber-900 ring-amber-200",
  ok: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  none: "bg-slate-100 text-slate-600 ring-slate-200",
};
