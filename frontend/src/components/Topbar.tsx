"use client";

import { useState } from "react";
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
      <div className="flex items-center justify-between px-7 py-4 bg-white border-b border-gray-200">
        <div className="text-xl font-medium text-[#1a1a2e]">
          Hello, {userName.split(" ")[0]}!
        </div>
        <div className="flex items-center gap-4.5">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6b7280"
            strokeWidth="2"
            className="cursor-pointer"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="text-gray-500 text-sm cursor-pointer">Docs</span>

          <button
            onClick={() => setShowLogout(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold uppercase tracking-wider hover:bg-red-50 transition-colors cursor-pointer"
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
              className="w-9 h-9 rounded-full cursor-pointer"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center text-white font-semibold text-[13px] cursor-pointer">
              {initials}
            </div>
          )}
        </div>
      </div>

      <LogoutModal open={showLogout} onClose={() => setShowLogout(false)} />
    </>
  );
}
