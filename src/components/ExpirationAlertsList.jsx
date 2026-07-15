"use client";

import Link from "next/link";
import { formatExpiryDate } from "@/src/lib/expiry-utils";

export default function ExpirationAlertsList({ alerts, showInventoryLink = true }) {
  if (!alerts?.length) return null;

  const expired = alerts.filter((a) => a.status === "expired");
  const expiringSoon = alerts.filter((a) => a.status === "expiring_soon");

  return (
    <div className="space-y-3">
      {expired.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-900">
            {expired.length} producto(s) vencido(s)
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {expired.slice(0, 8).map((alert) => (
              <li key={alert.product.id}>• {alert.message}</li>
            ))}
            {expired.length > 8 && (
              <li className="text-red-600">… y {expired.length - 8} más</li>
            )}
          </ul>
        </div>
      )}

      {expiringSoon.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {expiringSoon.length} producto(s) próximo(s) a vencer (30 días o menos)
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {expiringSoon.slice(0, 8).map((alert) => (
              <li key={alert.product.id}>
                • {alert.product.name} — vence {formatExpiryDate(alert.expiryDate)}
                {alert.daysRemaining != null && alert.daysRemaining >= 0 && (
                  <span className="text-amber-700"> ({alert.daysRemaining} días)</span>
                )}
              </li>
            ))}
            {expiringSoon.length > 8 && (
              <li className="text-amber-700">… y {expiringSoon.length - 8} más</li>
            )}
          </ul>
        </div>
      )}

      {showInventoryLink && (
        <Link
          href="/dashboard/inventario"
          className="inline-block text-xs font-semibold text-indigo-700 underline"
        >
          Ver inventario y actualizar fechas
        </Link>
      )}
    </div>
  );
}
