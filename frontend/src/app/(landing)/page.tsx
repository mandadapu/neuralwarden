"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import LoginModal from "@/components/LoginModal";

/* ── Animated grid background ─────────────────────────────── */

function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Radial gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,230,138,0.08) 0%, transparent 60%)",
        }}
      />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Scan line */}
      <div
        className="absolute left-0 right-0 h-px opacity-20"
        style={{
          background:
            "linear-gradient(90deg, transparent, #00e68a, transparent)",
          animation: "scanline 4s ease-in-out infinite",
        }}
      />

      {/* Floating orbs */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-[0.03]"
        style={{
          background: "radial-gradient(circle, #00e68a 0%, transparent 70%)",
          top: "10%",
          right: "-10%",
          animation: "float 8s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-[0.02]"
        style={{
          background: "radial-gradient(circle, #00e68a 0%, transparent 70%)",
          bottom: "5%",
          left: "-5%",
          animation: "float 10s ease-in-out infinite reverse",
        }}
      />
    </div>
  );
}

/* ── Stat counter ─────────────────────────────────────────── */

function StatItem({
  value,
  label,
  delay,
}: {
  value: string;
  label: string;
  delay: number;
}) {
  return (
    <div
      className="text-center"
      style={{
        animation: `fadeUp 0.6s ${delay}s both`,
      }}
    >
      <div
        className="text-2xl md:text-3xl font-bold tracking-tight"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          color: "#00e68a",
        }}
      >
        {value}
      </div>
      <div className="text-xs text-[#4a6058] mt-1 uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}

/* ── Pillar card ──────────────────────────────────────────── */

function PillarCard({
  icon,
  title,
  description,
  tag,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tag: string;
  delay: number;
}) {
  return (
    <div
      className="group relative"
      style={{ animation: `fadeUp 0.7s ${delay}s both` }}
    >
      {/* Glow border on hover */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[#00e68a]/0 to-[#00e68a]/0 group-hover:from-[#00e68a]/20 group-hover:to-transparent transition-all duration-500" />

      <div className="relative bg-[#1c2128]/80 backdrop-blur-sm border border-[#30363d] rounded-2xl p-7 h-full transition-all duration-500 group-hover:border-[#00e68a]/20 group-hover:bg-[#1c2128]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#00e68a]/[0.07] border border-[#00e68a]/10 flex items-center justify-center text-[#00e68a]">
            {icon}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#00e68a]/50 bg-[#00e68a]/[0.05] px-2.5 py-1 rounded-full">
            {tag}
          </span>
        </div>
        <h3
          className="text-[17px] text-white mb-2"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
        >
          {title}
        </h3>
        <p className="text-[13px] text-[#8b949e] leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

/* ── Agent node ───────────────────────────────────────────── */

function AgentNode({
  label,
  active,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          active ? "bg-[#00e68a] shadow-[0_0_8px_rgba(0,230,138,0.5)]" : "bg-[#30363d]"
        }`}
      />
      <span
        className={`text-xs font-medium ${
          active ? "text-[#00e68a]" : "text-[#8b949e]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ── Main landing content ─────────────────────────────────── */

function LandingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [showLogin, setShowLogin] = useState(false);
  const [mounted, setMounted] = useState(false);

  function handleAccessDashboard() {
    if (session) {
      router.push("/feed");
    } else {
      setShowLogin(true);
    }
  }

  useEffect(() => {
    if (searchParams.get("login") === "true") setShowLogin(true);
    setMounted(true);
  }, [searchParams]);

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{
        background:
          "linear-gradient(180deg, #0d1117 0%, #161b22 40%, #0d1117 100%)",
      }}
    >
      {/* Keyframe animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');

        @keyframes scanline {
          0%, 100% { top: 0%; opacity: 0; }
          10% { opacity: 0.2; }
          50% { top: 100%; opacity: 0.15; }
          90% { opacity: 0; }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-30px); }
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes pulse-line {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.4; }
        }

        @keyframes typing {
          from { width: 0; }
          to { width: 100%; }
        }
      `}</style>

      <GridBackground />

      {/* ── Header ─────────────────────────────────────── */}
      <header
        className="relative z-10 flex items-center justify-between px-8 md:px-12 py-6"
        style={{ animation: mounted ? "fadeIn 0.5s 0.1s both" : "none" }}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00e68a]/20 to-[#00e68a]/5 border border-[#00e68a]/20 flex items-center justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#00e68a"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            {/* Status indicator */}
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0d1117]" />
          </div>
          <span
            className="text-white text-base font-medium tracking-tight"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            NeuralWarden
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-xs text-[#8b949e] font-mono">
            v3.0 — operational
          </span>
          <button
            onClick={handleAccessDashboard}
            className="px-5 py-2 rounded-lg bg-[#00e68a]/10 border border-[#00e68a]/20 text-[#00e68a] text-sm font-medium hover:bg-[#00e68a]/20 hover:border-[#00e68a]/30 transition-all duration-300 cursor-pointer"
          >
            {session ? "Go to Dashboard" : "Access Dashboard"}
          </button>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 md:px-12 pb-12">
        {/* Overline */}
        <div
          className="flex items-center gap-3 mb-8"
          style={{ animation: mounted ? "fadeUp 0.6s 0.2s both" : "none" }}
        >
          <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#00e68a]/40" />
          <span
            className="text-[11px] uppercase tracking-[0.25em] text-[#00e68a]/60 font-medium"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            AI-Powered Cloud & Code Security
          </span>
          <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#00e68a]/40" />
        </div>

        {/* Headline */}
        <h1
          className="text-center mb-6"
          style={{ animation: mounted ? "fadeUp 0.7s 0.3s both" : "none" }}
        >
          <span
            className="block text-5xl md:text-7xl leading-[1.1] text-white"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
          >
            Your cloud &amp; code
          </span>
          <span
            className="block text-5xl md:text-7xl leading-[1.1] mt-1"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              background: "linear-gradient(135deg, #00e68a, #009952, #00e68a)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            have a guardian now.
          </span>
        </h1>

        {/* Subheading */}
        <p
          className="text-center text-[#8b949e] text-lg md:text-xl max-w-2xl mb-10 leading-relaxed"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            animation: mounted ? "fadeUp 0.7s 0.45s both" : "none",
          }}
        >
          AI agents scan your cloud infrastructure and source code simultaneously
          — finding CVEs in dependencies, secrets in commits, vulnerabilities in code,
          and misconfigurations in your cloud. All autonomous, all in one scan.
        </p>

        {/* CTA row */}
        <div
          className="flex flex-col sm:flex-row items-center gap-4 mb-16"
          style={{ animation: mounted ? "fadeUp 0.7s 0.55s both" : "none" }}
        >
          <button
            onClick={handleAccessDashboard}
            className="group px-8 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer relative overflow-hidden"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              background: "linear-gradient(135deg, #00e68a, #009952)",
              color: "#0d1117",
            }}
          >
            <span className="relative z-10">Start Scanning</span>
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
          </button>
          <a
            href="https://github.com/mandadapu/neuralwarden"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium text-[#8b949e] hover:text-white border border-[#30363d] hover:border-[#3d444d] transition-all duration-300"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            View on GitHub
          </a>
        </div>

        {/* ── Stats bar ────────────────────────────────── */}
        <div
          className="flex items-center gap-10 md:gap-16 mb-20"
          style={{ animation: mounted ? "fadeUp 0.7s 0.65s both" : "none" }}
        >
          <StatItem value="30+" label="Secret Patterns" delay={0.7} />
          <div className="w-px h-8 bg-[#30363d]" />
          <StatItem value="12" label="Ecosystems" delay={0.8} />
          <div className="w-px h-8 bg-[#30363d]" />
          <StatItem value="AI" label="SAST Engine" delay={0.9} />
          <div className="w-px h-8 bg-[#30363d]" />
          <StatItem value="$0" label="Scan Cost" delay={1.0} />
        </div>

        {/* ── Four Security Pillars ─────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl w-full mb-20">
          <PillarCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            }
            title="Infrastructure & Runtime"
            tag="Cloud"
            description="Maps your GCP attack surface — VMs, firewalls, buckets, IAM — then correlates misconfigurations with live log evidence."
            delay={0.8}
          />
          <PillarCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M12 18v-6" />
                <path d="M9 15l3 3 3-3" />
              </svg>
            }
            title="Code & Supply Chain"
            tag="SCA + SAST"
            description="AI-powered SAST finds vulnerabilities in your code. SCA scans 12 ecosystems for CVEs via OSV.dev. 30+ secret patterns detect leaked credentials."
            delay={0.95}
          />
          <PillarCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            }
            title="AI & Agentic Security"
            tag="AI-Native"
            description="Detects prompt injection, model integrity attacks, and autonomous agent hijacking across your AI-powered systems."
            delay={1.1}
          />
          <PillarCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            }
            title="Threat Intel & Perimeter"
            tag="Defense"
            description="Active threat detection — correlating vulnerabilities with live logs, MITRE mappings, and generating ready-to-run remediation scripts."
            delay={1.25}
          />
        </div>

        {/* ── Pipeline preview ─────────────────────────── */}
        <div
          className="max-w-4xl w-full"
          style={{ animation: mounted ? "fadeUp 0.7s 1.2s both" : "none" }}
        >
          <div className="text-center mb-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b949e]">
              Two Autonomous Pipelines — One Platform
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Cloud Scan Pipeline */}
            <div className="bg-[#1c2128]/60 backdrop-blur-sm border border-[#30363d] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00e68a]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#00e68a]/70">
                  Cloud Scan Super Agent
                </span>
              </div>
              <div className="flex flex-col gap-2 pl-4 mb-4">
                <AgentNode label="Discovery" active />
                <AgentNode label="Router" active />
                <div className="flex items-center gap-3 pl-2">
                  <AgentNode label="Active Scanner" active />
                  <AgentNode label="Log Analyzer" active />
                </div>
                <AgentNode label="Correlation Engine" active />
                <AgentNode label="Remediation" active />
              </div>

              {/* Connector */}
              <div className="flex items-center gap-2 pl-4 mb-3">
                <div
                  className="w-px h-4 opacity-30"
                  style={{
                    background: "linear-gradient(to bottom, #00e68a, transparent)",
                    animation: "pulse-line 2s ease-in-out infinite",
                  }}
                />
                <span className="text-[9px] text-[#3d444d]">feeds into threat pipeline</span>
              </div>

              {/* Threat Pipeline */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#f59e0b]/70">
                  Neural Engine
                </span>
                <span className="text-[10px] text-[#3d444d] ml-1">— Claude</span>
              </div>
              <div className="flex flex-col gap-2 pl-4">
                <AgentNode label="Ingest → Detect → Validate" />
                <AgentNode label="Classify → HITL → Report" />
              </div>
            </div>

            {/* Repository Scan Pipeline */}
            <div className="bg-[#1c2128]/60 backdrop-blur-sm border border-[#30363d] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[#58a6ff]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#58a6ff]/70">
                  Repository Scan Engine
                </span>
              </div>
              <div className="flex flex-col gap-3 pl-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#58a6ff] shadow-[0_0_8px_rgba(88,166,255,0.5)]" />
                  <span className="text-xs font-medium text-[#58a6ff]">Secret Detection</span>
                  <span className="text-[9px] text-[#3d444d]">— 30+ patterns</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#58a6ff] shadow-[0_0_8px_rgba(88,166,255,0.5)]" />
                  <span className="text-xs font-medium text-[#58a6ff]">SCA Scanner</span>
                  <span className="text-[9px] text-[#3d444d]">— OSV.dev CVEs</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#58a6ff] shadow-[0_0_8px_rgba(88,166,255,0.5)]" />
                  <span className="text-xs font-medium text-[#58a6ff]">AI SAST</span>
                  <span className="text-[9px] text-[#3d444d]">— Claude Haiku</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#58a6ff] shadow-[0_0_8px_rgba(88,166,255,0.5)]" />
                  <span className="text-xs font-medium text-[#58a6ff]">License Scan</span>
                  <span className="text-[9px] text-[#3d444d]">— copyleft detection</span>
                </div>
              </div>

              {/* Ecosystems */}
              <div className="mt-5 pt-4 border-t border-[#30363d]/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#f59e0b]/70">
                    12 Ecosystems
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-4">
                  {["npm", "PyPI", "Go", "Cargo", "RubyGems", "NuGet", "Pub", "Composer"].map((eco) => (
                    <span key={eco} className="text-[9px] text-[#8b949e] bg-[#30363d]/40 px-2 py-0.5 rounded-full">
                      {eco}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="relative z-10 px-8 md:px-12 py-8 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-[#161b22]">
        <div className="flex items-center gap-6">
          <span
            className="text-xs text-[#3d444d]"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            NeuralWarden &copy; {new Date().getFullYear()}
          </span>
          <span className="text-[10px] text-[#161b22] font-mono">
            neuralwarden.com
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-[#3d444d]">
            Built with LangGraph + Claude + Next.js
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
            <span className="text-[10px] text-emerald-500/60 font-medium">
              All systems operational
            </span>
          </div>
        </div>
      </footer>

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  );
}
