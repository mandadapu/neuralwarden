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
    <div className="min-h-screen bg-[#040a07] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#00e68a]/10 border border-[#00e68a]/20 mb-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00e68a" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <p className="text-[#5a7068] text-sm">Redirecting to {provider}…</p>
      </div>
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
