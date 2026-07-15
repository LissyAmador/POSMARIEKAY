"use client";

import { useEffect, useState } from "react";
import { getExpirationAlerts } from "@/src/lib/pos-api";
import { useBranch } from "@/src/hooks/useBranchContext";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import ExpirationAlertsList from "@/src/components/ExpirationAlertsList";

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

  return (
    <div className="mb-6">
      <ExpirationAlertsList alerts={alerts} />
    </div>
  );
}
