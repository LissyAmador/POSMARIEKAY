"use client";

import ReceiptContent from "@/src/components/ReceiptContent";

export default function ReceiptModal({
  sale,
  items,
  tenant,
  branch,
  paymentMethod,
  onClose,
  title = "Detalle del recibo",
}) {
  if (!sale) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>

        <div className="px-6 py-4">
          <ReceiptContent
            sale={sale}
            items={items}
            tenant={tenant}
            branch={branch}
            paymentMethod={paymentMethod}
            variant="screen"
            showActions
          />
        </div>
      </div>
    </div>
  );
}
