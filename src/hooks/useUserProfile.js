"use client";

import { useEffect, useState } from "react";
import { auth, getUserProfile } from "@/src/lib/pos-api";

export function useUserProfile() {
  const [profile, setProfile] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        const {
          data: { user },
        } = await auth.getUser();

        if (!user) {
          if (mounted) {
            setProfile(null);
            setLoading(false);
          }
          return;
        }

        const { data: profileData, error: profileError } =
          await getUserProfile(user.id);

        if (profileError) throw profileError;

        if (mounted) {
          setProfile(profileData);
          setTenant(profileData.tenants);
          setBranch(profileData.branches);
        }
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProfile();

    const {
      data: { subscription },
    } = auth.onAuthStateChange(() => {
      loadProfile();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { profile, tenant, branch, loading, error };
}

export function formatCurrency(amount, currency = "GTQ") {
  const locale = currency === "USD" ? "en-US" : "es-GT";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Number(amount) || 0);
}

export function formatDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function daysUntilDue(dueDate) {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
}
