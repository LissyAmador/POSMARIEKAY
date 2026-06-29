"use client";

import { useBranch } from "@/src/hooks/useBranchContext";

export default function BranchBanner() {
  const { activeBranch, branches, canSwitchBranch } = useBranch();

  if (!canSwitchBranch || branches.length <= 1 || !activeBranch) {
    return null;
  }

  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
      <span className="text-lg">🏪</span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Sucursal activa
        </p>
        <p className="font-semibold text-indigo-950">{activeBranch.name}</p>
        {activeBranch.address && (
          <p className="text-xs text-indigo-700/80">{activeBranch.address}</p>
        )}
      </div>
      <span className="ml-auto rounded-full bg-indigo-200 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-800">
        {branches.length} sucursales
      </span>
    </div>
  );
}
