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
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <p className="text-gray-400 text-sm">Signing in…</p>
    </div>
  );
}
