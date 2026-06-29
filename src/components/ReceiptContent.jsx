"use client";

import { createPortal } from "react-dom";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  buildQrValue,
  calculateSubtotal,
  formatReceiptDate,
  formatReceiptDateShort,
  getItemName,
  getReceiptNumber,
} from "@/src/lib/receipt-utils";
import { getDigitalReceiptPath, triggerNativePrint } from "@/src/lib/print-receipt";
import { useCurrency } from "@/src/hooks/useCurrency";

function ReceiptBody({
  sale,
  items,
  tenant,
  branch,
  paymentMethod,
  variant,
  formatMoney,
  qrRef,
  voided = false,
}) {
  const subtotal = calculateSubtotal(items);
  const receiptNo = getReceiptNumber(sale.id);
  const isCompact = variant === "thermal";
  const qrValue = buildQrValue(sale, branch);

  const paymentLabel =
    sale.type === "contado"
      ? paymentMethod || sale.payment_method || "efectivo"
      : sale.type === "credito"
        ? "crédito"
        : sale.type;

  const containerClass =
    variant === "thermal"
      ? "mx-auto w-full max-w-[80mm] font-mono text-[11px] leading-snug text-black"
      : variant === "half-letter"
        ? "mx-auto w-full max-w-[5.5in] text-sm leading-relaxed text-slate-900"
        : "w-full text-sm text-slate-900";

  return (
    <div className={containerClass}>
      {voided && (
        <div className="mb-3 border-2 border-red-500 py-2 text-center text-sm font-bold uppercase text-red-600">
          Recibo anulado
        </div>
      )}

      <div
        className={
          isCompact
            ? "border-b border-dashed border-slate-400 pb-3 text-center"
            : "border-b-2 border-slate-900 pb-4 text-center"
        }
      >
        <h2 className={isCompact ? "text-sm font-bold" : "text-xl font-bold"}>
          {tenant?.name || "POS SaaS"}
        </h2>
        <p className={isCompact ? "text-[10px] text-slate-600" : "text-slate-600"}>
          {branch?.name}
        </p>
        {branch?.address && (
          <p className={isCompact ? "text-[10px] text-slate-500" : "text-sm text-slate-500"}>
            {branch.address}
          </p>
        )}
        <p className={`mt-2 font-semibold ${isCompact ? "text-[11px]" : "text-base"}`}>
          RECIBO DE VENTA
        </p>
        <p className={isCompact ? "text-[10px] text-slate-500" : "text-xs text-slate-500"}>
          No. {receiptNo}
        </p>
        <p className={isCompact ? "text-[10px] text-slate-500" : "text-xs text-slate-500"}>
          {formatReceiptDate(sale.created_at)}
        </p>
      </div>

      <div
        className={`${
          isCompact
            ? "mt-3 space-y-1"
            : "mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"
        }`}
      >
        {sale.client_name && (
          <p>
            <span className="text-slate-500">Cliente: </span>
            <span className="font-medium">{sale.client_name}</span>
          </p>
        )}
        <p>
          <span className="text-slate-500">Tipo: </span>
          <span className="capitalize">{sale.type}</span>
        </p>
        <p>
          <span className="text-slate-500">Pago: </span>
          <span className="capitalize">{paymentLabel}</span>
        </p>
        {sale.type === "credito" && sale.due_date && (
          <p className="text-amber-700">
            <span className="text-slate-500">Vence: </span>
            {formatReceiptDateShort(sale.due_date)}
          </p>
        )}
      </div>

      <table className={`mt-4 w-full ${isCompact ? "text-[10px]" : "text-sm"}`}>
        <thead>
          <tr className="border-b border-slate-300 text-left text-slate-500">
            <th className="pb-2">Descripción</th>
            <th className="pb-2 text-center">Cant.</th>
            {!isCompact && <th className="pb-2 text-right">P. unit.</th>}
            <th className="pb-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id || item.product_id}>
              <td className="py-2 pr-2">{getItemName(item)}</td>
              <td className="py-2 text-center">{item.quantity}</td>
              {!isCompact && (
                <td className="py-2 text-right">{formatMoney(Number(item.price))}</td>
              )}
              <td className="py-2 text-right">
                {formatMoney(Number(item.price) * item.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        className={`mt-4 space-y-1 border-t border-slate-300 pt-4 ${
          isCompact ? "text-[11px]" : "text-sm"
        }`}
      >
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal)}</span>
        </div>
        <div
          className={`flex justify-between font-bold text-slate-900 ${
            isCompact ? "text-sm" : "text-lg"
          }`}
        >
          <span>TOTAL</span>
          <span>{formatMoney(sale.total)}</span>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center border-t border-dashed border-slate-300 pt-4">
        <QRCodeCanvas
          ref={qrRef}
          value={qrValue}
          size={isCompact ? 96 : 140}
          level="M"
          includeMargin
        />
        <p className="mt-2 text-center text-xs text-slate-500">
          Escanee para abrir el recibo digital
        </p>
        <p className="mt-1 break-all text-center text-[10px] text-slate-400">
          pos-saas-black.vercel.app/recibo/{sale.id.slice(0, 8)}
        </p>
      </div>
    </div>
  );
}

export default function ReceiptContent({
  sale,
  items,
  tenant,
  branch,
  paymentMethod,
  variant = "screen",
  showActions = variant === "screen",
}) {
  const { formatMoney } = useCurrency();
  const [printFormat, setPrintFormat] = useState("half-letter");
  const [mounted, setMounted] = useState(false);
  const qrRef = useRef(null);
  const voided = sale.status === "anulada";

  useEffect(() => setMounted(true), []);

  function handlePrint(format) {
    setPrintFormat(format);
    requestAnimationFrame(() => {
      setTimeout(() => triggerNativePrint(format), 80);
    });
  }

  const printVariant = printFormat === "thermal" ? "thermal" : "half-letter";

  return (
    <>
      <ReceiptBody
        sale={sale}
        items={items}
        tenant={tenant}
        branch={branch}
        paymentMethod={paymentMethod}
        variant={variant}
        formatMoney={formatMoney}
        qrRef={qrRef}
        voided={voided}
      />

      {showActions && (
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => handlePrint("thermal")}
            className="rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Imprimir térmica
          </button>
          <button
            type="button"
            onClick={() => handlePrint("half-letter")}
            className="rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Imprimir media carta
          </button>
          <Link
            href={getDigitalReceiptPath(sale.id)}
            className="rounded-lg border border-indigo-200 bg-indigo-50 py-2.5 text-center text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Ver digital
          </Link>
        </div>
      )}

      {mounted &&
        createPortal(
          <div
            id="print-receipt-root"
            className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] bg-white"
          >
            <ReceiptBody
              sale={sale}
              items={items}
              tenant={tenant}
              branch={branch}
              paymentMethod={paymentMethod}
              variant={printVariant}
              formatMoney={formatMoney}
              qrRef={qrRef}
              voided={voided}
            />
          </div>,
          document.body
        )}
    </>
  );
}
