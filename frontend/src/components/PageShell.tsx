import Topbar from "./Topbar";

export default function PageShell({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      <Topbar />
      <div className="px-7 py-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            {icon}
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1a1a2e]">{title}</h1>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}
