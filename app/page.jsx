"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/src/lib/pos-api";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await auth.getSession();
      router.replace(session ? "/dashboard" : "/login");
    }
    checkAuth();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
    </div>
  );
}
