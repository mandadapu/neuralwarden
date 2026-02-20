export default function LandingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white flex flex-col">
      {children}
    </div>
  );
}
