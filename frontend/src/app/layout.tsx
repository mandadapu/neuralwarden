import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { AnalysisProvider } from "@/context/AnalysisContext";

export const metadata: Metadata = {
  title: "NeuralWarden — Security Dashboard",
  description: "AI NeuralWarden Pipeline v2.0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-surface">
        <AnalysisProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </AnalysisProvider>
      </body>
    </html>
  );
}
