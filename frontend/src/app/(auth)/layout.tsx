export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      {children}
    </div>
  );
}
