"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import LoginModal from "@/components/LoginModal";

function LandingContent() {
  const searchParams = useSearchParams();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (searchParams.get("login") === "true") {
      setShowLogin(true);
    }
  }, [searchParams]);

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#6c5ce7] to-[#4834d4] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span className="text-white text-lg font-bold tracking-tight">NeuralWarden</span>
        </div>

        <button
          onClick={() => setShowLogin(true)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#4834d4] text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
        >
          Login
        </button>
      </header>

      {/* Hero — placeholder */}
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center px-8">
          <p className="text-sm text-gray-500 uppercase tracking-[0.2em] mb-4">AI-Powered Cloud Security</p>
          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
            <span className="text-white">Secure everything,</span>
            <br />
            <span className="bg-gradient-to-r from-[#6c5ce7] to-[#4834d4] bg-clip-text text-transparent">
              Compromise nothing.
            </span>
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto mb-10">
            Autonomous defense loop — from asset discovery to vulnerability scanning,
            threat correlation, and automated remediation.
          </p>

          {/* Three Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-3xl mx-auto mb-10">
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 text-left">
              <div className="w-9 h-9 rounded-lg bg-[#6c5ce7]/20 flex items-center justify-center mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
                </svg>
              </div>
              <h3 className="text-white text-sm font-semibold mb-1">Neural Discovery</h3>
              <p className="text-gray-500 text-xs leading-relaxed">Maps your cloud attack surface autonomously across Compute, Storage, Firewall, and IAM.</p>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 text-left">
              <div className="w-9 h-9 rounded-lg bg-[#6c5ce7]/20 flex items-center justify-center mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="8" rx="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" />
                  <circle cx="7" cy="6" r="1" fill="#6c5ce7" />
                  <circle cx="7" cy="18" r="1" fill="#6c5ce7" />
                </svg>
              </div>
              <h3 className="text-white text-sm font-semibold mb-1">Agentic Analysis</h3>
              <p className="text-gray-500 text-xs leading-relaxed">12 parallel AI agents investigate every resource with compliance checks and behavioral log queries.</p>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 text-left">
              <div className="w-9 h-9 rounded-lg bg-[#6c5ce7]/20 flex items-center justify-center mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
              <h3 className="text-white text-sm font-semibold mb-1">Automated Wardenship</h3>
              <p className="text-gray-500 text-xs leading-relaxed">Closes the loop with correlation-driven severity escalation and ready-to-run remediation scripts.</p>
            </div>
          </div>

          <button
            onClick={() => setShowLogin(true)}
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#4834d4] text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Get Started
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-6 text-center text-sm text-gray-600">
        NeuralWarden &copy; {new Date().getFullYear()}
      </footer>

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
}

export default function LandingPage() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  );
}
