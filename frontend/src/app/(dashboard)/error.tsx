"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-red-400 text-sm">Something went wrong loading this page.</p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm bg-[#21262d] border border-[#30363d] rounded-lg text-white hover:bg-[#30363d] transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
