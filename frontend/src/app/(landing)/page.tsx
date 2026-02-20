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
          <p className="text-gray-400 text-lg max-w-xl mx-auto mb-8">
            Autonomous defense loop — from asset discovery to vulnerability scanning,
            threat correlation, and automated remediation.
          </p>
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
