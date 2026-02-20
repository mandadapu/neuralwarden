"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function AuthPopupContent() {
  const searchParams = useSearchParams();
  const provider = searchParams.get("provider") || "google";

  useEffect(() => {
    signIn(provider, { callbackUrl: "/auth-popup-callback" });
  }, [provider]);

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <p className="text-gray-400 text-sm">Redirecting to {provider}…</p>
    </div>
  );
}

export default function AuthPopupPage() {
  return (
    <Suspense>
      <AuthPopupContent />
    </Suspense>
  );
}
