import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeuralWarden — Security Dashboard",
  description: "NeuralWarden — AI-Powered Cloud Security Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-surface">{children}</body>
    </html>
  );
}
