"use client";

import { handleSignOut } from "@/app/actions";

interface LogoutModalProps {
  open: boolean;
  onClose: () => void;
}

export default function LogoutModal({ open, onClose }: LogoutModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#1a1a2e] border border-gray-700/50 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
        </div>

        <h2 className="text-center text-lg font-bold text-white mb-2">
          SESSION TERMINATION
        </h2>
        <p className="text-center text-sm text-gray-400 mb-7">
          This will end your current session and require re-authentication to access the dashboard.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-600 text-gray-300 font-medium hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <form action={handleSignOut} className="flex-1">
            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors cursor-pointer"
            >
              Terminate Session
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
