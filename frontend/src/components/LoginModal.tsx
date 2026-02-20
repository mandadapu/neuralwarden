"use client";

import { useRouter } from "next/navigation";
import { useEffect, useCallback } from "react";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const router = useRouter();

  const handleAuthCallback = useCallback(
    (e: MessageEvent) => {
      if (e.data?.type === "auth-callback" && e.origin === window.location.origin) {
        onClose();
        router.push("/feed");
        router.refresh();
      }
    },
    [onClose, router]
  );

  useEffect(() => {
    window.addEventListener("message", handleAuthCallback);
    return () => window.removeEventListener("message", handleAuthCallback);
  }, [handleAuthCallback]);

  function handleSignIn(provider: string) {
    const width = 500;
    const height = 620;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `/auth-popup?provider=${provider}`,
      "auth-popup",
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );

    if (!popup) {
      // Popup blocked — fall back to full-page redirect
      window.location.href = `/auth-popup?provider=${provider}`;
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#0d1117]/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#1c2128] border border-[#30363d] rounded-2xl p-8 w-full max-w-sm shadow-2xl shadow-black/50">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8b949e] hover:text-white transition-colors cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00e68a]/20 to-[#009952]/10 border border-[#00e68a]/20 mb-5">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00e68a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <p className="text-[11px] text-[#8b949e] uppercase tracking-[0.2em] mb-2">Initializing Identity Handshake</p>
          <h2 className="text-lg font-bold text-white">SYSTEM ACCESS</h2>
          <p className="text-sm text-[#8b949e] mt-1">Authorization Required</p>
          <div className="mx-auto mt-4 w-16 h-0.5 bg-gradient-to-r from-[#00e68a] to-[#009952] rounded-full" />
        </div>

        {/* OAuth Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => handleSignIn("github")}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-[#0a1a12] border border-[#30363d] text-white font-medium hover:bg-[#0e2018] hover:border-[#00e68a]/30 transition-all cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Authorize: GitHub
          </button>

          <button
            onClick={() => handleSignIn("google")}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-white text-gray-800 font-medium hover:bg-gray-100 transition-all cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Authorize: Google
          </button>
        </div>

        <p className="text-center text-[11px] text-[#2a4035] mt-6">
          256-bit Encrypted Session
        </p>
      </div>
    </div>
  );
}
