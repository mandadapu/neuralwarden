"use client";

import { SessionProvider } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { AnalysisProvider } from "@/context/AnalysisContext";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SessionProvider>
      <AnalysisProvider>
        <div className="flex flex-col min-h-screen">
          <Topbar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </AnalysisProvider>
    </SessionProvider>
  );
}
