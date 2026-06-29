"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useUserProfile } from "./useUserProfile";
import { getTenantBranches } from "@/src/lib/pos-api";

const BranchContext = createContext(null);

const ADMIN_ROLES = new Set(["super_admin", "admin_org"]);

function storageKey(userId) {
  return `pos-active-branch-${userId}`;
}

export function BranchProvider({ children }) {
  const { profile, branch: homeBranch, loading: profileLoading } = useUserProfile();
  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranchState] = useState(null);
  const [loading, setLoading] = useState(true);

  const canSwitchBranch = ADMIN_ROLES.has(profile?.role);

  useEffect(() => {
    if (!profile?.tenant_id) {
      setBranches([]);
      setLoading(false);
      return;
    }

    let mounted = true;

    async function loadBranches() {
      const { data } = await getTenantBranches(profile.tenant_id);
      if (mounted) {
        setBranches(data || []);
        setLoading(false);
      }
    }

    loadBranches();
    return () => {
      mounted = false;
    };
  }, [profile?.tenant_id]);

  useEffect(() => {
    if (profileLoading || loading || !profile) return;

    const assigned =
      branches.find((b) => b.id === profile.branch_id) || homeBranch || branches[0];

    if (!canSwitchBranch) {
      setActiveBranchState(assigned || null);
      return;
    }

    const savedId =
      typeof window !== "undefined"
        ? localStorage.getItem(storageKey(profile.user_id))
        : null;
    const savedBranch = branches.find((b) => b.id === savedId);

    setActiveBranchState(savedBranch || assigned || branches[0] || null);
  }, [profile, branches, homeBranch, canSwitchBranch, profileLoading, loading]);

  function setActiveBranch(branch) {
    if (!canSwitchBranch || !branch) return;
    setActiveBranchState(branch);
    if (profile?.user_id && typeof window !== "undefined") {
      localStorage.setItem(storageKey(profile.user_id), branch.id);
    }
  }

  const value = useMemo(
    () => ({
      activeBranch,
      branches,
      setActiveBranch,
      canSwitchBranch,
      homeBranch: homeBranch || branches.find((b) => b.id === profile?.branch_id),
      branchLoading: profileLoading || loading,
    }),
    [activeBranch, branches, canSwitchBranch, homeBranch, profile, profileLoading, loading]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error("useBranch debe usarse dentro de BranchProvider");
  }
  return context;
}
