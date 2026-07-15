/** Cache en sessionStorage para alertas de vencimiento (TTL 1 hora). */

const TTL_MS = 60 * 60 * 1000;

function cacheKey(tenantId, branchId) {
  return `expiry-alerts:${tenantId}:${branchId}`;
}

export function getCachedExpirationAlerts(tenantId, branchId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(tenantId, branchId));
    if (!raw) return null;
    const { data, cachedAt } = JSON.parse(raw);
    if (Date.now() - cachedAt > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function setCachedExpirationAlerts(tenantId, branchId, alerts) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    cacheKey(tenantId, branchId),
    JSON.stringify({ data: alerts, cachedAt: Date.now() })
  );
}

export function invalidateExpirationAlertsCache(tenantId, branchId) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(cacheKey(tenantId, branchId));
}

export async function fetchExpirationAlertsCached(tenantId, branchId, fetcher) {
  const cached = getCachedExpirationAlerts(tenantId, branchId);
  if (cached) return { data: cached, error: null };

  const result = await fetcher(tenantId, branchId);
  if (!result.error) {
    setCachedExpirationAlerts(tenantId, branchId, result.data || []);
  }
  return result;
}
