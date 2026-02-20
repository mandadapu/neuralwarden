"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import LogoutModal from "./LogoutModal";

export default function Topbar() {
  const { data: session } = useSession();
  const [showLogout, setShowLogout] = useState(false);

  const userName = session?.user?.name || "Analyst";
  const userImage = session?.user?.image;
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <div className="flex items-center justify-between px-7 py-4 border-b border-[#30363d]">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00e68a]/20 to-[#009952]/10 border border-[#00e68a]/20 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span className="text-[#00e68a] text-base font-bold tracking-tight">NeuralWarden</span>
        </Link>
        <div className="flex items-center gap-4.5">
          <span className="text-sm font-medium text-white">
            Hello, {userName.split(" ")[0]}!
          </span>
          <div className="h-5 w-px bg-[#30363d]" />
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8b949e"
            strokeWidth="2"
            className="cursor-pointer hover:stroke-[#00e68a] transition-colors"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="text-[#8b949e] text-sm cursor-pointer hover:text-[#00e68a] transition-colors">Docs</span>

          <button
            onClick={() => setShowLogout(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs font-semibold uppercase tracking-wider hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Terminate Session
          </button>

          {userImage ? (
            <img
              src={userImage}
              alt={userName}
              className="w-9 h-9 rounded-full cursor-pointer border border-[#30363d]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00e68a]/20 to-[#009952]/10 border border-[#00e68a]/20 flex items-center justify-center text-[#00e68a] font-semibold text-[13px] cursor-pointer">
              {initials}
            </div>
          )}
        </div>
      </div>

      <LogoutModal open={showLogout} onClose={() => setShowLogout(false)} />
    </>
  );
}
