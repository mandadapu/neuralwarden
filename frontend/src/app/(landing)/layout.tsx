"use client";

import { SessionProvider } from "next-auth/react";

export default function LandingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <div className="min-h-screen text-white">
        {children}
      </div>
    </SessionProvider>
  );
}
