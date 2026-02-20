"use client";

import { useEffect } from "react";

export default function AuthPopupCallback() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "auth-callback" }, window.location.origin);
      window.close();
    } else {
      // Fallback: if not in a popup, redirect to feed
      window.location.href = "/feed";
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#00e68a]/10 border border-[#00e68a]/20 mb-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00e68a" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <p className="text-[#8b949e] text-sm">Signing in…</p>
      </div>
    </div>
  );
}
