"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getExpirationAlerts } from "@/src/lib/pos-api";
import { useBranch } from "@/src/hooks/useBranchContext";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import { formatExpiryDate } from "@/src/lib/expiry-utils";

export default function ExpirationAlertBanner() {
  const { profile } = useUserProfile();
  const { activeBranch: branch } = useBranch();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.tenant_id || !branch?.id) return;

    async function load() {
      setLoading(true);
      const { data } = await getExpirationAlerts(profile.tenant_id, branch.id);
      setAlerts(data || []);
      setLoading(false);
    }

    load();
  }, [profile?.tenant_id, branch?.id]);

  if (loading || alerts.length === 0) return null;

  const expired = alerts.filter((a) => a.status === "expired");
  const expiringSoon = alerts.filter((a) => a.status === "expiring_soon");

  return (
    <div className="mb-6 space-y-3">
      {expired.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-900">
            ⚠️ {expired.length} producto(s) de maquillaje vencido(s)
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {expired.slice(0, 5).map((alert) => (
              <li key={alert.product.id}>• {alert.message}</li>
            ))}
            {expired.length > 5 && (
              <li className="text-red-600">… y {expired.length - 5} más</li>
            )}
          </ul>
        </div>
      )}

      {expiringSoon.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            🔔 {expiringSoon.length} producto(s) de maquillaje próximo(s) a vencer (2 meses o menos)
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {expiringSoon.slice(0, 5).map((alert) => (
              <li key={alert.product.id}>
                • {alert.product.name} — vence {formatExpiryDate(alert.expiryDate)}
                {alert.daysRemaining != null && alert.daysRemaining >= 0 && (
                  <span className="text-amber-700"> ({alert.daysRemaining} días)</span>
                )}
              </li>
            ))}
            {expiringSoon.length > 5 && (
              <li className="text-amber-700">… y {expiringSoon.length - 5} más</li>
            )}
          </ul>
          <Link
            href="/dashboard/inventario"
            className="mt-2 inline-block text-xs font-semibold text-amber-800 underline"
          >
            Ver inventario y actualizar fechas
          </Link>
        </div>
      )}
    </div>
  );
}
